import { Navigate } from "react-router-dom";

export default function ProtectedRoute({ children }) {
  const isAuth = localStorage.getItem("ss_auth") === "true";
  return isAuth ? children : <Navigate to="/" replace />;
}
