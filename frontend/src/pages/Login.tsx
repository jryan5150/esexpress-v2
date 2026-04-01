import { Button } from "@/components/Button";

/* -------------------------------------------------------------------------- */
/*  Login — standalone auth page, no sidebar/layout wrapper                   */
/* -------------------------------------------------------------------------- */

export function Login() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--es-bg-base)] relative">
      {/* Subtle radial gradient overlay */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(at 0% 0%, rgba(240,105,44,0.05) 0px, transparent 50%), radial-gradient(at 100% 100%, rgba(240,105,44,0.03) 0px, transparent 50%)",
        }}
      />

      {/* Dot grid background */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage:
            "radial-gradient(var(--es-text-primary) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      <main className="w-full max-w-[420px] px-6 py-12 relative z-10">
        {/* Branding */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-14 h-14 bg-[var(--es-bg-elevated)] flex items-center justify-center rounded-xl mb-6 shadow-xl relative group">
            <div className="absolute inset-0 bg-[var(--es-accent)] opacity-10 blur-xl group-hover:opacity-20 transition-opacity" />
            <span
              className="material-symbols-outlined text-[var(--es-accent)] text-4xl relative z-10"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              terminal
            </span>
          </div>
          <h1 className="font-bold text-3xl tracking-tighter text-[var(--es-text-primary)] uppercase">
            EsExpress <span className="text-[var(--es-accent)]">v2</span>
          </h1>
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--es-text-secondary)] opacity-60 mt-2">
            Logistics Command Center
          </p>
        </div>

        {/* Auth Card */}
        <div className="bg-[#161b28] rounded-xl p-8 shadow-2xl relative overflow-hidden">
          {/* Decorative accent line */}
          <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-[var(--es-accent)] to-transparent opacity-50" />

          <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
            {/* Email */}
            <div className="space-y-2">
              <label
                className="text-xs font-bold uppercase tracking-widest text-[#e0c0b4]"
                htmlFor="email"
              >
                Operator Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <span className="material-symbols-outlined text-[var(--es-text-secondary)] opacity-40 text-lg">
                    alternate_email
                  </span>
                </div>
                <input
                  className="w-full bg-[var(--es-bg-inset)] border-none focus:ring-1 focus:ring-[var(--es-accent)] text-[var(--es-text-primary)] rounded-lg pl-11 py-3.5 font-[var(--es-font-mono)] text-sm placeholder:text-[var(--es-text-secondary)] placeholder:opacity-30 transition-all"
                  style={{ boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.1)" }}
                  id="email"
                  name="email"
                  placeholder="username@terminal.oil"
                  required
                  type="email"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label
                  className="text-xs font-bold uppercase tracking-widest text-[#e0c0b4]"
                  htmlFor="password"
                >
                  Access Key
                </label>
                <a
                  className="text-[10px] uppercase tracking-wider text-[var(--es-accent)] hover:underline transition-all cursor-pointer"
                  href="#"
                >
                  Forgot?
                </a>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <span className="material-symbols-outlined text-[var(--es-text-secondary)] opacity-40 text-lg">
                    lock
                  </span>
                </div>
                <input
                  className="w-full bg-[var(--es-bg-inset)] border-none focus:ring-1 focus:ring-[var(--es-accent)] text-[var(--es-text-primary)] rounded-lg pl-11 py-3.5 font-[var(--es-font-mono)] text-sm placeholder:text-[var(--es-text-secondary)] placeholder:opacity-30 transition-all"
                  style={{ boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.1)" }}
                  id="password"
                  name="password"
                  placeholder="&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;"
                  required
                  type="password"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="pt-4 space-y-4">
              {/* Sign In */}
              <Button
                variant="primary"
                className="w-full py-4 font-extrabold uppercase tracking-widest flex items-center justify-center gap-2 active:scale-[0.98]"
                style={{
                  boxShadow:
                    "0 10px 15px -3px rgba(240,105,44,0.2), 0 4px 6px -4px rgba(240,105,44,0.2), inset 0 1px 0 0 rgba(255,255,255,0.1)",
                }}
                type="submit"
              >
                Sign In
                <span className="material-symbols-outlined text-lg">
                  arrow_forward
                </span>
              </Button>

              {/* Divider */}
              <div className="flex items-center py-2">
                <div className="flex-grow h-px bg-[var(--es-text-secondary)] opacity-10" />
                <span className="px-4 text-[10px] uppercase tracking-[0.3em] text-[var(--es-text-secondary)] opacity-30">
                  External Auth
                </span>
                <div className="flex-grow h-px bg-[var(--es-text-secondary)] opacity-10" />
              </div>

              {/* Google SSO */}
              <button
                className="w-full bg-[var(--es-bg-elevated)] hover:bg-[var(--es-bg-overlay)] active:scale-[0.98] text-[var(--es-text-primary)] font-bold text-sm py-4 rounded-lg transition-all flex items-center justify-center gap-3 border border-[var(--es-border-subtle)] border-opacity-10"
                type="button"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 48 48"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    fill="#EA4335"
                    d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                  />
                  <path
                    fill="#34A853"
                    d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                  />
                </svg>
                Continue with Google
              </button>
            </div>
          </form>
        </div>

        {/* Footer */}
        <footer className="mt-8 text-center space-y-4">
          <p className="text-[10px] uppercase tracking-widest text-[var(--es-text-secondary)] opacity-40">
            Terminal Authorization Required &bull; System ID:{" "}
            <span className="text-[#e0c0b4] font-medium">TX-492-B</span>
          </p>
          <div className="flex justify-center gap-6">
            <a
              className="text-[var(--es-text-secondary)] opacity-30 hover:text-[var(--es-accent)] hover:opacity-100 transition-colors cursor-pointer"
              href="#"
            >
              <span className="material-symbols-outlined text-xl">
                help_center
              </span>
            </a>
            <a
              className="text-[var(--es-text-secondary)] opacity-30 hover:text-[var(--es-accent)] hover:opacity-100 transition-colors cursor-pointer"
              href="#"
            >
              <span className="material-symbols-outlined text-xl">
                security
              </span>
            </a>
            <a
              className="text-[var(--es-text-secondary)] opacity-30 hover:text-[var(--es-accent)] hover:opacity-100 transition-colors cursor-pointer"
              href="#"
            >
              <span className="material-symbols-outlined text-xl">
                language
              </span>
            </a>
          </div>
        </footer>
      </main>
    </div>
  );
}
