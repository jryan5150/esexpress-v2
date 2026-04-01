import { Button } from "@/components/Button";

/* -------------------------------------------------------------------------- */
/*  Login — standalone auth page, no sidebar/layout wrapper                   */
/* -------------------------------------------------------------------------- */

export function Login() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-base)] relative">
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
            "radial-gradient(var(--text-primary) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      <main className="w-full max-w-[420px] px-6 py-12 relative z-10">
        {/* Branding */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-14 h-14 bg-[var(--bg-elevated)] flex items-center justify-center rounded-[var(--radius-lg)] mb-6 shadow-[var(--shadow-lg)] relative group">
            <div className="absolute inset-0 bg-[var(--accent)] opacity-10 blur-xl group-hover:opacity-20 transition-opacity rounded-[var(--radius-lg)]" />
            <span className="text-[var(--accent)] text-2xl font-bold relative z-10">
              ES
            </span>
          </div>
          <h1 className="font-bold text-3xl tracking-tighter text-[var(--text-primary)] uppercase">
            EsExpress <span className="text-[var(--accent)]">v2</span>
          </h1>
          <p className="text-[var(--text-xs)] uppercase tracking-[0.2em] text-[var(--text-tertiary)] mt-2">
            Logistics Command Center
          </p>
        </div>

        {/* Auth Card */}
        <div className="bg-[var(--bg-surface)] rounded-[var(--radius-lg)] p-8 shadow-[var(--shadow-lg)] relative overflow-hidden">
          {/* Decorative accent line */}
          <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-[var(--accent)] to-transparent opacity-50" />

          <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
            {/* Email */}
            <div className="space-y-2">
              <label
                className="text-[var(--text-xs)] font-bold uppercase tracking-widest text-[var(--text-tertiary)]"
                htmlFor="email"
              >
                Operator Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <span className="text-[var(--text-tertiary)] text-sm">@</span>
                </div>
                <input
                  className="w-full bg-[var(--bg-inset)] border-none focus:ring-1 focus:ring-[var(--accent)] text-[var(--text-primary)] rounded-[var(--radius-md)] pl-11 py-3.5 font-[var(--font-mono)] text-sm placeholder:text-[var(--text-tertiary)] transition-all"
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
                  className="text-[var(--text-xs)] font-bold uppercase tracking-widest text-[var(--text-tertiary)]"
                  htmlFor="password"
                >
                  Access Key
                </label>
                <a
                  className="text-[10px] uppercase tracking-wider text-[var(--accent)] hover:underline transition-all cursor-pointer"
                  href="#"
                >
                  Forgot?
                </a>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <span className="text-[var(--text-tertiary)] text-sm">
                    &#x1F512;
                  </span>
                </div>
                <input
                  className="w-full bg-[var(--bg-inset)] border-none focus:ring-1 focus:ring-[var(--accent)] text-[var(--text-primary)] rounded-[var(--radius-md)] pl-11 py-3.5 font-[var(--font-mono)] text-sm placeholder:text-[var(--text-tertiary)] transition-all"
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
                className="w-full py-4 font-extrabold uppercase tracking-widest shadow-[var(--shadow-lg)] flex items-center justify-center gap-2"
                type="submit"
              >
                Sign In &rarr;
              </Button>

              {/* Divider */}
              <div className="flex items-center py-2">
                <div className="flex-grow h-px bg-[var(--border-subtle)]" />
                <span className="px-4 text-[10px] uppercase tracking-[0.3em] text-[var(--text-tertiary)]">
                  External Auth
                </span>
                <div className="flex-grow h-px bg-[var(--border-subtle)]" />
              </div>

              {/* Google SSO */}
              <Button
                variant="secondary"
                className="w-full py-4 font-bold text-sm flex items-center justify-center gap-3"
                type="button"
              >
                <span className="text-lg font-bold text-[var(--text-primary)]">
                  G
                </span>
                Continue with Google
              </Button>
            </div>
          </form>
        </div>

        {/* Footer */}
        <footer className="mt-8 text-center space-y-4">
          <p className="text-[10px] uppercase tracking-widest text-[var(--text-tertiary)]">
            Terminal Authorization Required &bull; System ID:{" "}
            <span className="text-[var(--text-secondary)] font-medium">
              TX-492-B
            </span>
          </p>
        </footer>
      </main>
    </div>
  );
}
