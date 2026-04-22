import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

/**
 * Magic-link landing page.
 *
 * Backend redirects to `/magic-link?token=<jwt>` on a successful verify.
 * We match the password-login storage pattern (localStorage under
 * "esexpress-token" — see hooks/use-auth.ts) so the rest of the app's
 * auth plumbing works without modification.
 *
 * On missing/invalid token we bounce to /login with an error hint.
 */
export function MagicLinkLanding() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [status, setStatus] = useState<"working" | "error">("working");

  useEffect(() => {
    const token = params.get("token");
    if (!token) {
      setStatus("error");
      const timer = setTimeout(
        () => navigate("/login?error=magic_link_missing", { replace: true }),
        1200,
      );
      return () => clearTimeout(timer);
    }

    // Match password-login: stash the JWT under the same localStorage key.
    localStorage.setItem("esexpress-token", token);
    // Hard reload so TanStack Query picks up the new auth state without
    // stale /auth/me cache.
    window.location.replace("/");
  }, [params, navigate]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-sm w-full bg-surface-container-low/90 backdrop-blur-md rounded-xl p-8 border border-on-surface/5 shadow-2xl shadow-black/30 text-center space-y-4">
        {status === "working" ? (
          <>
            <span className="material-symbols-outlined text-primary-container text-4xl animate-spin inline-block">
              progress_activity
            </span>
            <div>
              <h2 className="text-lg font-bold font-headline text-on-surface">
                Signing you in...
              </h2>
              <p className="text-xs text-on-surface/50 mt-2">
                Storing your session and loading the dispatch desk.
              </p>
            </div>
          </>
        ) : (
          <>
            <span className="material-symbols-outlined text-error text-4xl inline-block">
              error
            </span>
            <div>
              <h2 className="text-lg font-bold font-headline text-on-surface">
                Link missing or invalid
              </h2>
              <p className="text-xs text-on-surface/50 mt-2">
                Redirecting you back to sign-in...
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
