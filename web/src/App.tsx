import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./lib/AuthContext.js";
import { Login } from "./pages/Login.js";
import { Chat } from "./pages/Chat.js";
import { Plans } from "./pages/Plans.js";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return <>{children}</>;
}

function Shell({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();

  return (
    <div className="app-shell">
      <div className="top-bar">
        <span className="top-bar__title">AI Coach</span>
        {user && (
          <button className="btn btn--ghost" onClick={signOut}>
            Sign out
          </button>
        )}
      </div>
      {user && (
        <nav className="tabs">
          <NavLink to="/chat" className={({ isActive }) => `tab${isActive ? " tab--active" : ""}`}>
            Chat
          </NavLink>
          <NavLink to="/plans" className={({ isActive }) => `tab${isActive ? " tab--active" : ""}`}>
            Plans
          </NavLink>
        </nav>
      )}
      {children}
    </div>
  );
}

export function App() {
  return (
    <Shell>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/chat"
          element={
            <RequireAuth>
              <Chat />
            </RequireAuth>
          }
        />
        <Route
          path="/plans"
          element={
            <RequireAuth>
              <Plans />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/chat" replace />} />
      </Routes>
    </Shell>
  );
}
