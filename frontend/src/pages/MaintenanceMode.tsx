/**
 * Single-operator soft-maintenance page.
 *
 * Rendered when the backend returns 403 with code MAINTENANCE_MODE
 * (see lib/api.ts redirect logic). The user is authenticated but their
 * email isn't in MAINTENANCE_ALLOW_EMAILS — they get held here with a
 * friendly explanation + a logout option so they can come back later.
 *
 * Distinct from the full-site maintenance page (frontend/index.html
 * before app boot). This is INSIDE the React app — the user has logged
 * in successfully but is gated at the API layer.
 */
import { useEffect, useState } from "react";

export function MaintenanceMode() {
  const [reason, setReason] = useState<string>(
    "ES Express v2 is in single-operator validation mode.",
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const r = params.get("reason");
    if (r) setReason(r);
  }, []);

  function handleSignOut() {
    localStorage.removeItem("esexpress-token");
    window.location.replace("/login");
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-primary, #0a0c0f)",
        color: "var(--text-primary, #f8fafc)",
        padding: "2rem",
      }}
    >
      <div
        style={{
          maxWidth: 560,
          textAlign: "center",
          background: "var(--bg-card, #12151a)",
          borderRadius: 12,
          padding: "2.5rem 2rem",
          boxShadow: "0 8px 32px rgba(0,0,0,0.35)",
        }}
      >
        <div
          style={{
            fontSize: "2rem",
            marginBottom: "0.75rem",
            fontWeight: 700,
            letterSpacing: "-0.02em",
          }}
        >
          ES Express — Validation Mode
        </div>
        <p
          style={{
            color: "var(--text-secondary, #94a3b8)",
            lineHeight: 1.6,
            marginBottom: "1.5rem",
          }}
        >
          {reason}
        </p>
        <p
          style={{
            color: "var(--text-secondary, #94a3b8)",
            lineHeight: 1.5,
            marginBottom: "2rem",
            fontSize: "0.92rem",
          }}
        >
          The team is validating the dispatch system before reopening to all
          users. Access will resume shortly. If you need urgent assistance,
          contact dispatch directly.
        </p>
        <button
          onClick={handleSignOut}
          style={{
            background: "var(--accent, #ff6b2c)",
            color: "white",
            border: "none",
            borderRadius: 8,
            padding: "0.75rem 1.5rem",
            fontSize: "0.95rem",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
