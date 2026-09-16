import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext.js";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: { client_id: string; callback: (response: { credential: string }) => void }) => void;
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

export function Login() {
  const { signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const buttonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) {
      console.error("VITE_GOOGLE_CLIENT_ID is not set — Google sign-in button can't render.");
      return;
    }

    // index.html loads the Google Identity Services script with `async defer`, so it may not
    // be ready yet when this effect first runs — poll briefly instead of racing it.
    let cancelled = false;
    const tryRender = () => {
      if (cancelled) return;
      if (!window.google || !buttonRef.current) {
        setTimeout(tryRender, 100);
        return;
      }
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (response) => {
          await signInWithGoogle(response.credential);
          navigate("/chat", { replace: true });
        },
      });
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: "outline",
        size: "large",
        shape: "pill",
      });
    };
    tryRender();

    return () => {
      cancelled = true;
    };
  }, [signInWithGoogle, navigate]);

  return (
    <div className="login-page">
      <div className="login-page__mark">🌱</div>
      <h1 className="login-page__title">AI Coach</h1>
      <p className="login-page__subtitle">Sign in to chat with your coaching personas and see your plans.</p>
      <div ref={buttonRef} />
    </div>
  );
}
