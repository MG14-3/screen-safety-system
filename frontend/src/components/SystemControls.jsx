import { useState } from "react";
import { api } from "../api.js";

const COMMANDS = [
  {
    id:    "SYSTEM_ON",
    label: "Enable System",
    icon:  "✅",
    desc:  "Activate proximity safety monitoring",
    cls:   "btn-success",
  },
  {
    id:    "SYSTEM_OFF",
    label: "Disable System",
    icon:  "⏹️",
    desc:  "Stop all safety monitoring",
    cls:   "btn-danger",
  },
  {
    id:    "FORCE_SAFE",
    label: "Force Normal",
    icon:  "☀️",
    desc:  "Restore full brightness immediately",
    cls:   "btn-warning",
  },
  {
    id:    "RELEASE_SAFE",
    label: "Release Override",
    icon:  "🔓",
    desc:  "Return to automatic mode",
    cls:   "btn-outline",
  },
];

export default function SystemControls({ onToast }) {
  const [loading, setLoading] = useState({});

  const handleCommand = async (cmdId) => {
    setLoading((l) => ({ ...l, [cmdId]: true }));
    try {
      await api.sendCommand(cmdId);
      onToast?.(`Command sent: ${cmdId.replace("_", " ")}`, "success");
    } catch (e) {
      onToast?.(`Failed: ${e.message}`, "error");
    } finally {
      setLoading((l) => ({ ...l, [cmdId]: false }));
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-icon">🎛️</span>
        <h2 className="card-title">System Controls</h2>
      </div>

      <div className="controls-grid">
        {COMMANDS.map((cmd) => (
          <button
            key={cmd.id}
            id={`btn-${cmd.id.toLowerCase()}`}
            className={`ctrl-btn ${cmd.cls}`}
            onClick={() => handleCommand(cmd.id)}
            disabled={loading[cmd.id]}
          >
            <span className="ctrl-icon">{loading[cmd.id] ? "⏳" : cmd.icon}</span>
            <span className="ctrl-label">{cmd.label}</span>
            <span className="ctrl-desc">{cmd.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
