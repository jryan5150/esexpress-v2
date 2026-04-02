import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLogin } from "../hooks/use-auth";

export function Login() {
  const navigate = useNavigate();
  const login = useLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    login.mutate(
      { email, password },
      {
        onSuccess: () => navigate("/"),
      },
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Branding */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-surface-container-high rounded-2xl border border-on-surface/10 mx-auto">
            <span className="material-symbols-outlined text-primary-container text-3xl">
              terminal
            </span>
          </div>
          <div>
            <h1 className="text-3xl font-black font-headline tracking-tighter text-on-surface uppercase">
              EsExpress
            </h1>
            <p className="text-sm font-label text-on-surface/40 tracking-widest uppercase mt-1">
              v2 // Dispatch Command
            </p>
          </div>
        </div>

        {/* Login Card */}
        <div className="bg-surface-container-low rounded-xl p-8 border border-on-surface/5 shadow-2xl shadow-black/30 space-y-6">
          <div className="space-y-1">
            <h2 className="text-lg font-bold font-headline text-on-surface">
              Operator Access
            </h2>
            <p className="text-xs text-on-surface/40 font-label uppercase tracking-widest">
              Authenticate to continue
            </p>
          </div>

          {login.isError && (
            <div className="bg-error/10 border border-error/20 rounded-lg px-4 py-3 flex items-center gap-3">
              <span className="material-symbols-outlined text-error text-lg">
                error
              </span>
              <p className="text-sm text-error font-medium">
                {login.error?.message ||
                  "Authentication failed. Check your credentials."}
              </p>
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label
                htmlFor="email"
                className="block text-[10px] font-bold font-label uppercase tracking-widest text-on-surface/50"
              >
                Operator Email
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-on-surface/30 text-lg">
                  mail
                </span>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="operator@esexpress.com"
                  className="w-full bg-surface-container-high border border-on-surface/10 rounded-lg px-4 py-3 pl-10 text-sm text-on-surface placeholder:text-on-surface/20 font-body focus:outline-none focus:border-primary-container/50 focus:ring-1 focus:ring-primary-container/30 transition-all"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="password"
                className="block text-[10px] font-bold font-label uppercase tracking-widest text-on-surface/50"
              >
                Access Key
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-on-surface/30 text-lg">
                  lock
                </span>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter access key"
                  className="w-full bg-surface-container-high border border-on-surface/10 rounded-lg px-4 py-3 pl-10 text-sm text-on-surface placeholder:text-on-surface/20 font-body focus:outline-none focus:border-primary-container/50 focus:ring-1 focus:ring-primary-container/30 transition-all"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={login.isPending}
              className="w-full bg-primary-container text-on-primary-container py-3.5 rounded-lg font-bold text-sm uppercase tracking-wider hover:brightness-110 transition-all active:scale-[0.98] shadow-lg shadow-primary-container/30 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {login.isPending ? (
                <>
                  <span className="material-symbols-outlined text-sm animate-spin">
                    progress_activity
                  </span>
                  Authenticating...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-sm">
                    login
                  </span>
                  Sign In
                </>
              )}
            </button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-on-surface/10" />
            </div>
            <div className="relative flex justify-center text-[10px]">
              <span className="bg-surface-container-low px-3 text-on-surface/30 font-label uppercase tracking-widest">
                or
              </span>
            </div>
          </div>

          <button className="w-full bg-surface-container-high border border-on-surface/10 py-3.5 rounded-lg font-bold text-sm text-on-surface hover:bg-surface-container-highest transition-all flex items-center justify-center gap-3">
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Continue with Google
          </button>
        </div>

        {/* Footer */}
        <div className="text-center space-y-2">
          <p className="text-[10px] text-on-surface/20 font-mono tracking-wider">
            SYS-ID: ESX-DISPATCH-V2.0.1 // TERMINAL: UNASSIGNED
          </p>
          <p className="text-[10px] text-on-surface/15 font-label">
            ES Express LLC // Secure Access Portal
          </p>
        </div>
      </div>
    </div>
  );
}
