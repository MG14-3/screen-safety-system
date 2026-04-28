import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import StatusCard     from "../components/StatusCard.jsx";
import SystemControls from "../components/SystemControls.jsx";
import CameraFeed     from "../components/CameraFeed.jsx";
import LogsTable      from "../components/LogsTable.jsx";

export default function Dashboard() {
  const navigate = useNavigate();
  const user     = localStorage.getItem("ss_user") || "admin";
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((msg, type = "success") => {
    const id = Date.now();
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  const logout = () => {
    localStorage.removeItem("ss_auth");
    localStorage.removeItem("ss_user");
    navigate("/");
  };

  return (
    <div className="dashboard-bg">
      {/* Toasts */}
      <div className="toast-container" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            {t.type === "success" ? "✅" : "❌"} {t.msg}
          </div>
        ))}
      </div>

      {/* Top Navbar */}
      <nav className="navbar">
        <div className="nav-brand">
          <span className="nav-logo">🛡️</span>
          <span className="nav-title">SafeScreen</span>
          <span className="nav-badge">LIVE</span>
        </div>
        <div className="nav-right">
          <span className="nav-user">👤 {user}</span>
          <button id="btn-logout" className="btn-logout" onClick={logout}>
            Logout →
          </button>
        </div>
      </nav>

      {/* Page content */}
      <main className="dashboard-main">
        {/* Hero banner */}
        <div className="dash-hero">
          <h1 className="dash-heading">Dashboard</h1>
          <p className="dash-sub">
            Monitoring screen safety in real-time using proximity and age detection
          </p>
        </div>

        {/* Primary grid: status + controls */}
        <div className="dash-grid-2">
          <StatusCard />
          <SystemControls onToast={addToast} />
        </div>

        {/* Camera full-width */}
        <CameraFeed />

        {/* Logs full-width */}
        <LogsTable />
      </main>
    </div>
  );
}
