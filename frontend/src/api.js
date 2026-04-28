// ─── Central API helper ───────────────────────────────────────────
export const BASE_URL   = "http://localhost:3000";
export const CAMERA_URL = "http://localhost:5000/video_feed";

const fetchJSON = async (path, opts = {}) => {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (res.status === 204) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
};

export const api = {
  // Logs
  getLogs:    (limit = 50) => fetchJSON(`/api/logs?limit=${limit}`),
  postLog:    (data)       => fetchJSON("/api/logs", { method: "POST", body: JSON.stringify(data) }),

  // Status
  getStatus:  ()           => fetchJSON("/api/status"),

  // Commands
  sendCommand:(command)    => fetchJSON("/api/commands", { method: "POST", body: JSON.stringify({ command }) }),
};
