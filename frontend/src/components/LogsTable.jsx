import { useState, useEffect, useCallback } from "react";
import { api } from "../api.js";

const ACTION_STYLES = {
  STARTUP:    { bg: "#ffe4ec", color: "#c7547a" },
  NORMAL:     { bg: "#dcfce7", color: "#16a34a" },
  DIMMED:     { bg: "#fef9c3", color: "#b45309" },
  SCREEN_OFF: { bg: "#fee2e2", color: "#dc2626" },
  UNKNOWN:    { bg: "#f3f4f6", color: "#6b7280" },
};

function ActionBadge({ action }) {
  const s = ACTION_STYLES[action] || ACTION_STYLES.UNKNOWN;
  return (
    <span className="log-badge" style={{ background: s.bg, color: s.color }}>
      {action}
    </span>
  );
}

export default function LogsTable() {
  const [logs,    setLogs]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await api.getLogs(50);
      setLogs(data || []);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  return (
    <div className="card logs-card">
      <div className="card-header">
        <span className="card-icon">📋</span>
        <h2 className="card-title">System Logs</h2>
        <span className="log-count">{logs.length} entries</span>
      </div>

      <div className="table-wrap">
        {loading ? (
          <p className="status-loading">Loading logs…</p>
        ) : error ? (
          <p className="status-offline">Backend offline — logs unavailable</p>
        ) : logs.length === 0 ? (
          <p className="status-loading">No logs yet — start the Python script</p>
        ) : (
          <table className="logs-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Action</th>
                <th>Distance</th>
                <th>Age</th>
                <th>Brightness</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log._id}>
                  <td className="log-time">
                    {log.timestamp
                      ? new Date(log.timestamp).toLocaleTimeString()
                      : "—"}
                  </td>
                  <td><ActionBadge action={log.action} /></td>
                  <td>{log.distance != null ? `${log.distance} cm` : "—"}</td>
                  <td>
                    {log.age != null
                      ? <span style={{ color: log.age < 12 ? "#ef4444" : "#16a34a" }}>
                          {log.age} yrs {log.age < 12 ? "👶" : "🧑"}
                        </span>
                      : <span style={{ color: "#9ca3af" }}>—</span>}
                  </td>
                  <td>
                    <div className="bri-cell">
                      <span>{log.brightness ?? 100}%</span>
                      <div className="bri-bar-track">
                        <div className="bri-bar" style={{
                          width: `${log.brightness ?? 100}%`,
                        }} />
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
