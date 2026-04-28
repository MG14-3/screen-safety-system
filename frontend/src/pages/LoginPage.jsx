import { useState } from "react";
import { useNavigate } from "react-router-dom";

const DEMO_USER = "admin";
const DEMO_PASS = "safescreen123";

export default function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    await new Promise((r) => setTimeout(r, 600));

    if (username === DEMO_USER && password === DEMO_PASS) {
      localStorage.setItem("ss_auth", "true");
      localStorage.setItem("ss_user", username);
      navigate("/dashboard");
    } else {
      setError("Invalid credentials. Try admin / safescreen123");
    }
    setLoading(false);
  };

  return (
    <div className="login-bg">
      {/* Decorative blobs */}
      <div className="blob blob-1" />
      <div className="blob blob-2" />
      <div className="blob blob-3" />

      <div className="login-card">
        {/* Logo / header */}
        <div className="login-logo">
          <div className="logo-circle">
            <span>🛡️</span>
          </div>
          <h1 className="login-title">SafeScreen</h1>
          <p className="login-sub">Proximity-Based Screen Safety System</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form" id="login-form">
          <div className="field-wrap">
            <label htmlFor="username-input">Username</label>
            <div className="input-wrap">
              <span className="input-icon">👤</span>
              <input
                id="username-input"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                autoComplete="username"
                required
              />
            </div>
          </div>

          <div className="field-wrap">
            <label htmlFor="password-input">Password</label>
            <div className="input-wrap">
              <span className="input-icon">🔒</span>
              <input
                id="password-input"
                type={showPass ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="show-pass"
                onClick={() => setShowPass(!showPass)}
                aria-label="Toggle password visibility"
              >
                {showPass ? "🙈" : "👁️"}
              </button>
            </div>
          </div>

          {error && <p className="login-error" role="alert">{error}</p>}

          <button
            id="btn-login"
            type="submit"
            className="btn-login"
            disabled={loading}
          >
            {loading ? "Signing in…" : "Sign In →"}
          </button>
        </form>

        <p className="login-hint">
          Demo: <code>admin</code> / <code>safescreen123</code>
        </p>
      </div>
    </div>
  );
}
