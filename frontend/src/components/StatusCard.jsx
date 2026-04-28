import { useState, useEffect, useCallback } from "react";
import { api } from "../api.js";

const ACTION_META = {
  STARTUP:     { bg: "#ffe4ec", color: "#c7547a", label: "🚀 Startup" },
  NORMAL:      { bg: "#dcfce7", color: "#16a34a", label: "✅ Normal" },
  DIMMED:      { bg: "#fef9c3", color: "#b45309", label: "🔅 Dimmed" },
  SCREEN_OFF:  { bg: "#fee2e2", color: "#dc2626", label: "🔴 Screen Off" },
  UNKNOWN:     { bg: "#f3f4f6", color: "#6b7280", label: "⚪ Unknown" },
};

function getMeta(action = "UNKNOWN") {
  return ACTION_META[action] || ACTION_META.UNKNOWN;
}

export default function StatusCard() {
  const [status, setStatus] = useState(null);
  const [error,  setError]  = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await api.getStatus();
      setStatus(data);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 3000);
    return () => clearInterval(id);
  }, [refresh]);

  const meta = getMeta(status?.action);

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-icon">📡</span>
        <h2 className="card-title">Live Status</h2>
        <span className="pulse-dot" />
      </div>

      {error ? (
        <p className="status-offline">⚡ Backend offline — start Node.js server</p>
      ) : !status ? (
        <p className="status-loading">Connecting…</p>
      ) : (
        <div className="status-grid">
          {/* Action badge */}
          <div className="status-badge-wrap" style={{ gridColumn: "span 2" }}>
            <span className="status-badge"
              style={{ background: meta.bg, color: meta.color }}>
              {meta.label}
            </span>
          </div>

          {/* Distance */}
          <div className="stat-chip">
            <span className="stat-label">📏 Distance</span>
            <span className="stat-value">{status.distance ?? "—"} cm</span>
            <div className="stat-bar-track">
              <div className="stat-bar" style={{
                width: `${Math.min(100, ((status.distance ?? 0) / 200) * 100)}%`,
                background: (status.distance ?? 999) < 15
                  ? "#ef4444"
                  : (status.distance ?? 999) < 97
                  ? "#f59e0b"
                  : "#22c55e",
              }} />
            </div>
          </div>

          {/* Age */}
          <div className="stat-chip">
            <span className="stat-label">👤 Age</span>
            <span className="stat-value">
              {status.age != null ? `~${status.age} yrs` : "No face"}
            </span>
            {status.age != null && (
              <span className="age-tag"
                style={{ color: status.age < 12 ? "#ef4444" : "#16a34a" }}>
                {status.age < 12 ? "👶 Child" : "🧑 Adult"}
              </span>
            )}
          </div>

          {/* Brightness */}
          <div className="stat-chip" style={{ gridColumn: "span 2" }}>
            <span className="stat-label">💡 Screen Brightness</span>
            <span className="stat-value">{status.brightness ?? 100}%</span>
            <div className="stat-bar-track">
              <div className="stat-bar" style={{
                width: `${status.brightness ?? 100}%`,
                background: "linear-gradient(90deg,#ffb3c6,#ff4d7d)",
              }} />
            </div>
          </div>

          {/* Timestamp */}
          <p className="last-seen" style={{ gridColumn: "span 2" }}>
            Last updated:{" "}
            {status.timestamp
              ? new Date(status.timestamp).toLocaleTimeString()
              : "—"}
          </p>
        </div>
      )}
    </div>
  );
}
