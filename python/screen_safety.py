#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════
  Screen Safety System — Main Python Script
  ─────────────────────────────────────────────────────────────────
  • Reads distance (cm) from an ultrasonic sensor via USB serial
  • Captures webcam frames and runs DeepFace age estimation
  • Adjusts screen brightness based on distance + detected age:
        distance < 15 cm              → Screen OFF  (brightness 0%)
        distance < 97 cm + age < 12   → Dim screen  (brightness 30%)
        otherwise                     → Normal       (brightness 100%)
  • Streams MJPEG camera feed via Flask  →  http://localhost:5000/video_feed
  • Logs detection events to Node.js backend →  http://localhost:3000/api/logs
  • Polls backend for manual commands   →  http://localhost:3000/api/commands/latest
═══════════════════════════════════════════════════════════════════
"""

import re
import cv2
import serial
import threading
import time
import json
import requests
import logging
import sys
from flask import Flask, Response
from deepface import DeepFace
import screen_brightness_control as sbc

# ─── CONFIGURATION ────────────────────────────────────────────────────────────
SERIAL_PORT   = "COM5"          # ← Change to your COM port (e.g. COM3, /dev/ttyUSB0)
BAUD_RATE     = 9600
BACKEND_URL   = "http://localhost:3000"
FLASK_PORT    = 5000

# Thresholds
DIST_OFF      = 40.0            # cm — screen turns OFF below this
DIST_DIM      = 55.0            # cm — screen dims if child detected below this
AGE_CHILD_MAX = 30              # years — treat as child below this age
BRIGHTNESS_NORMAL = 50  # % — normal brightness (try to read current, fallback to 100)
BRIGHTNESS_DIM    = 30          # % — dimmed brightness
BRIGHTNESS_OFF    = 0           # % — screen off

# DeepFace detection interval (seconds) — avoid hammering GPU
DETECT_INTERVAL = 1.0

# ─── LOGGING ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
log = logging.getLogger("SafeScreen")

#─── Distance Reading ───────────────────────────────────────────

# ─── GLOBALS (thread-safe via lock) ───────────────────────────────────────────
state_lock        = threading.Lock()
current_distance  = 999.0       # cm
current_age       = None        # int or None
current_brightness= BRIGHTNESS_NORMAL
last_action       = "STARTUP"
system_enabled    = True        # can be toggled via backend command
current_frame     = None        # latest webcam frame (numpy array)
frame_lock        = threading.Lock()

# ─── BRIGHTNESS CONTROL ───────────────────────────────────────────────────────
def set_brightness(level: int):
    """Set screen brightness 0-100. Falls back gracefully if unavailable."""
    try:
        import screen_brightness_control as sbc
        sbc.set_brightness(max(0, min(100, level)))
        log.info(f"Brightness set to {level}%")
    except ImportError:
        # Fallback: Windows ctypes WMI
        try:
            import ctypes
            # Using PowerShell as last resort
            import subprocess
            # Map 0-100 → WMI 0-100
            subprocess.run(
                ["powershell", "-Command",
                 f"(Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods).WmiSetBrightness(1,{level})"],
                capture_output=True, timeout=3
            )
            log.info(f"Brightness set to {level}% (via PowerShell)")
        except Exception as e:
            log.warning(f"Could not set brightness: {e}")
    except Exception as e:
        log.warning(f"Brightness control error: {e}")

# ─── SERIAL READER THREAD ─────────────────────────────────────────────────────
_NUM_RE = re.compile(r"[-+]?\d*\.?\d+")

def serial_reader():
    """
    Reads distance from the Arduino Nano serial port.
    Handles any print format the Arduino sends, e.g.:
        "45.2"          → direct float
        "Distance: 45.2 cm"  → first number extracted
        "Dist=45"       → first number extracted
    """
    global current_distance
    while True:
        try:
            ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=2)
            log.info(f"✅ Serial connected on {SERIAL_PORT} @ {BAUD_RATE} baud")
            while True:
                raw = ser.readline().decode("utf-8", errors="ignore").strip()
                if not raw:
                    continue
                # Extract the first number from whatever Arduino printed
                match = _NUM_RE.search(raw)
                if match:
                    dist = float(match.group())
                    with state_lock:
                        current_distance = dist
                    log.info(f"📏 Distance: {dist:.1f} cm  (raw: {raw!r})")
                else:
                    log.debug(f"Serial (no number found): {raw!r}")
        except serial.SerialException as e:
            log.warning(f"Serial error ({e}). Retrying in 5 s…")
            time.sleep(5)
        except Exception as e:
            log.error(f"Serial reader crashed: {e}")
            time.sleep(5)

# ─── WEBCAM CAPTURE THREAD ────────────────────────────────────────────────────
def webcam_capture():
    """Continuously captures webcam frames into current_frame."""
    global current_frame
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        log.error("Cannot open webcam — camera feed disabled.")
        return
    log.info("Webcam capture started.")
    while True:
        ret, frame = cap.read()
        if ret:
            with frame_lock:
                current_frame = frame.copy()
        time.sleep(0.033)  # ~30 fps

# ─── AGE DETECTION THREAD ─────────────────────────────────────────────────────
def age_detection():
    """Periodically runs DeepFace on the latest webcam frame."""
    global current_age
    while True:
        time.sleep(DETECT_INTERVAL)
        with frame_lock:
            frame = current_frame.copy() if current_frame is not None else None
        if frame is None:
            continue
        try:
            results = DeepFace.analyze(
                frame,
                actions=["age"],
                enforce_detection=False,
                silent=True
            )
            if isinstance(results, list):
                results = results[0]
            age = int(results.get("age", 999))
            with state_lock:
                current_age = age
            log.info(f"DeepFace detected age: {age}")
        except Exception as e:
            log.debug(f"DeepFace error (no face?): {e}")
            with state_lock:
                current_age = None

# ─── MAIN SAFETY LOOP ─────────────────────────────────────────────────────────
HEARTBEAT_INTERVAL = 2.0   # seconds — how often to push live data to the website

def safety_loop():
    """
    Core logic: check distance + age and apply brightness.
    Also posts a heartbeat every HEARTBEAT_INTERVAL seconds so the
    React dashboard always shows current distance and detected age.
    """
    global current_brightness, last_action
    last_heartbeat = 0.0

    while True:
        time.sleep(0.5)
        now = time.time()

        with state_lock:
            enabled  = system_enabled
            dist     = current_distance
            age      = current_age
            old_bri  = current_brightness

        if not enabled:
            time.sleep(1)
            continue

        # ── Decision logic ──────────────────────────────────────────────
        if dist < DIST_OFF and age is not None and age < AGE_CHILD_MAX:
            new_bri = BRIGHTNESS_OFF
            action  = "SCREEN_OFF"
        elif dist < DIST_DIM and age is not None and age < AGE_CHILD_MAX:
            new_bri = BRIGHTNESS_DIM
            action  = "DIMMED"
        else:
            new_bri = BRIGHTNESS_NORMAL
            action  = "NORMAL"

        # ── Apply brightness if it changed ───────────────────────────────
        if new_bri != old_bri:
            set_brightness(new_bri)
            with state_lock:
                current_brightness = new_bri
                last_action        = action
            post_log(dist, age, new_bri, action)
            last_heartbeat = now   # reset heartbeat timer after a real event

        # ── Heartbeat: push live data to website even when stable ────────
        elif now - last_heartbeat >= HEARTBEAT_INTERVAL:
            post_log(dist, age, new_bri, action)
            last_heartbeat = now
            log.info(f"💓 Heartbeat → dist={dist:.1f}cm  age={age}  bri={new_bri}%  [{action}]")

# ─── BACKEND COMMUNICATION ────────────────────────────────────────────────────
def post_log(distance, age, brightness, action):
    """POST a detection event log to the Node.js backend."""
    payload = {
        "distance":   round(distance, 1),
        "age":        age,
        "brightness": brightness,
        "action":     action,
    }
    try:
        r = requests.post(f"{BACKEND_URL}/api/logs", json=payload, timeout=3)
        log.info(f"Log posted → {action} (HTTP {r.status_code})")
    except Exception as e:
        log.warning(f"Could not post log: {e}")


def command_poller():
    """Poll backend for manual commands (enable/disable system)."""
    global system_enabled, current_brightness
    while True:
        time.sleep(3)
        try:
            r = requests.get(f"{BACKEND_URL}/api/commands/latest", timeout=3)
            if r.status_code == 200:
                cmd = r.json()
                cmd_id   = cmd.get("_id")
                cmd_type = cmd.get("command", "")

                if cmd_type == "SYSTEM_OFF":
                    with state_lock:
                        system_enabled = False
                    set_brightness(BRIGHTNESS_NORMAL)
                    log.info("Command: System DISABLED")
                elif cmd_type == "SYSTEM_ON":
                    with state_lock:
                        system_enabled = True
                    log.info("Command: System ENABLED")
                elif cmd_type == "FORCE_SAFE":
                    set_brightness(BRIGHTNESS_NORMAL)
                    log.info("Command: Forced back to normal brightness")

                # Acknowledge command
                if cmd_id:
                    requests.patch(
                        f"{BACKEND_URL}/api/commands/{cmd_id}/execute",
                        timeout=3
                    )
        except Exception:
            pass  # Backend offline — keep running locally

# ─── FLASK MJPEG STREAM ───────────────────────────────────────────────────────
app = Flask(__name__)

def gen_frames():
    """Generator that yields MJPEG frames with age/distance overlay."""
    while True:
        with frame_lock:
            frame = current_frame.copy() if current_frame is not None else None

        if frame is None:
            time.sleep(0.1)
            continue

        # Overlay info
        with state_lock:
            dist = current_distance
            age  = current_age
            bri  = current_brightness
            act  = last_action

        overlay = frame.copy()
        # Semi-transparent bar at bottom
        h, w = overlay.shape[:2]
        cv2.rectangle(overlay, (0, h - 60), (w, h), (255, 192, 203), -1)
        cv2.addWeighted(overlay, 0.6, frame, 0.4, 0, frame)

        cv2.putText(frame, f"Dist: {dist:.1f}cm", (10, h - 38),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (80, 20, 60), 1)
        cv2.putText(frame, f"Age: {age if age else '?'}", (10, h - 15),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (80, 20, 60), 1)
        cv2.putText(frame, f"Brightness: {bri}%", (w - 185, h - 38),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (80, 20, 60), 1)
        cv2.putText(frame, f"Status: {act}", (w - 185, h - 15),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (80, 20, 60), 1)

        _, buffer = cv2.imencode(".jpg", frame)
        yield (b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" +
               buffer.tobytes() + b"\r\n")
        time.sleep(0.033)


@app.route("/video_feed")
def video_feed():
    return Response(gen_frames(),
                    mimetype="multipart/x-mixed-replace; boundary=frame")


@app.route("/status")
def status():
    with state_lock:
        return {
            "distance":   current_distance,
            "age":        current_age,
            "brightness": current_brightness,
            "action":     last_action,
            "enabled":    system_enabled,
        }


# ─── ENTRY POINT ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    log.info("═" * 60)
    log.info("  SafeScreen — Proximity-Based Screen Safety System")
    log.info("═" * 60)

    # Post startup log
    try:
        requests.post(f"{BACKEND_URL}/api/logs", json={
            "distance": 999, "age": None,
            "brightness": BRIGHTNESS_NORMAL, "action": "STARTUP"
        }, timeout=2)
    except Exception:
        log.warning("Backend not reachable — running in offline mode.")

    # Start all threads
    threads = [
        threading.Thread(target=serial_reader,   daemon=True, name="serial"),
        threading.Thread(target=webcam_capture,  daemon=True, name="webcam"),
        threading.Thread(target=age_detection,   daemon=True, name="deepface"),
        threading.Thread(target=safety_loop,     daemon=True, name="safety"),
        threading.Thread(target=command_poller,  daemon=True, name="commands"),
    ]
    for t in threads:
        t.start()
        log.info(f"  ✓ Thread started: {t.name}")

    log.info(f"\n  Flask stream  → http://localhost:{FLASK_PORT}/video_feed")
    log.info(f"  Flask status  → http://localhost:{FLASK_PORT}/status")
    log.info(f"  Backend URL   → {BACKEND_URL}\n")

    # Run Flask (blocks main thread)
    app.run(host="0.0.0.0", port=FLASK_PORT, threaded=True)
