import { useState } from "react";
import { CAMERA_URL } from "../api.js";

export default function CameraFeed() {
  const [active,  setActive]  = useState(true);
  const [error,   setError]   = useState(false);
  const [url,     setUrl]     = useState(CAMERA_URL);
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(CAMERA_URL);

  const handleError = () => setError(true);
  const handleLoad  = () => setError(false);

  const saveUrl = () => {
    setUrl(draft);
    setEditing(false);
    setError(false);
  };

  return (
    <div className="card camera-card">
      <div className="card-header">
        <span className="card-icon">📷</span>
        <h2 className="card-title">Live Camera Feed</h2>
        {active && !error && (
          <span className="live-badge">
            <span className="live-dot" /> LIVE
          </span>
        )}
      </div>

      {/* Feed area */}
      <div className="feed-wrap">
        {!active ? (
          <div className="feed-placeholder">
            <span className="feed-placeholder-icon">⏸️</span>
            <p>Feed paused</p>
          </div>
        ) : error ? (
          <div className="feed-placeholder feed-error">
            <span className="feed-placeholder-icon">📵</span>
            <p>Camera offline</p>
            <small>Start the Python script to stream</small>
          </div>
        ) : (
          <img
            src={`${url}?t=${Date.now()}`}
            alt="Live MJPEG camera feed"
            className="feed-img"
            onError={handleError}
            onLoad={handleLoad}
          />
        )}
      </div>

      {/* Controls row */}
      <div className="feed-controls">
        <button
          id="btn-toggle-feed"
          className={`btn-sm ${active ? "btn-sm-danger" : "btn-sm-success"}`}
          onClick={() => { setActive(!active); setError(false); }}
        >
          {active ? "⏸ Pause" : "▶ Resume"}
        </button>

        {!editing ? (
          <button className="btn-sm btn-sm-outline" onClick={() => setEditing(true)}>
            ✏️ Edit URL
          </button>
        ) : (
          <div className="url-edit">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="url-input"
              placeholder="http://localhost:5000/video_feed"
            />
            <button className="btn-sm btn-sm-success" onClick={saveUrl}>Save</button>
            <button className="btn-sm btn-sm-outline" onClick={() => setEditing(false)}>✕</button>
          </div>
        )}
      </div>
    </div>
  );
}
