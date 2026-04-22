import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useLogin } from "../hooks/use-auth";
import { api } from "../lib/api";

// Animated particle field — responsive, GPU-accelerated
function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let particles: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      r: number;
      opacity: number;
    }> = [];

    function resize() {
      canvas!.width = window.innerWidth;
      canvas!.height = window.innerHeight;
    }

    function init() {
      resize();
      const count = Math.floor((canvas!.width * canvas!.height) / 12000);
      particles = Array.from({ length: Math.min(count, 120) }, () => ({
        x: Math.random() * canvas!.width,
        y: Math.random() * canvas!.height,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        r: Math.random() * 2 + 0.5,
        opacity: Math.random() * 0.4 + 0.08,
      }));
    }

    function draw() {
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height);
      const w = canvas!.width;
      const h = canvas!.height;

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = w;
        if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h;
        if (p.y > h) p.y = 0;

        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(124, 58, 237, ${p.opacity})`;
        ctx!.fill();
      }

      // Draw connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 150) {
            ctx!.beginPath();
            ctx!.moveTo(particles[i].x, particles[i].y);
            ctx!.lineTo(particles[j].x, particles[j].y);
            ctx!.strokeStyle = `rgba(124, 58, 237, ${0.1 * (1 - dist / 150)})`;
            ctx!.lineWidth = 0.5;
            ctx!.stroke();
          }
        }
      }

      animId = requestAnimationFrame(draw);
    }

    init();
    draw();
    window.addEventListener("resize", init);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", init);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
    />
  );
}

export function Login() {
  const navigate = useNavigate();
  const login = useLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [magicMode, setMagicMode] = useState(false);
  const [magicEmail, setMagicEmail] = useState("");
  const [magicState, setMagicState] = useState<
    "idle" | "sending" | "sent" | "error"
  >("idle");
  const [magicError, setMagicError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    login.mutate(
      { email, password },
      {
        onSuccess: () => navigate("/workbench"),
      },
    );
  }

  async function handleMagicLinkSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMagicState("sending");
    setMagicError(null);
    try {
      await api.post<{ message: string }>("/auth/request-magic-link", {
        email: magicEmail,
      });
      setMagicState("sent");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Unable to send sign-in link.";
      setMagicError(message);
      setMagicState("error");
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      <ParticleBackground />

      {/* Gradient overlays */}
      <div className="fixed inset-0 bg-gradient-to-br from-primary-container/5 via-transparent to-tertiary/5 pointer-events-none" />
      <div className="fixed bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-background to-transparent pointer-events-none" />

      <div
        className="w-full max-w-md space-y-8 relative z-10"
        style={{
          animation: "loginEntrance 1.2s ease-out both",
        }}
      >
        <style>{`
          @keyframes loginEntrance {
            0% { opacity: 0; transform: translateY(20px) scale(0.98); }
            100% { opacity: 1; transform: translateY(0) scale(1); }
          }
          @keyframes accentGrow {
            0% { width: 0; opacity: 0; }
            100% { width: 2.5rem; opacity: 1; }
          }
          @keyframes subtitleFade {
            0% { opacity: 0; letter-spacing: 0.5em; }
            100% { opacity: 1; letter-spacing: 0.35em; }
          }
          @keyframes fieldSlide {
            0% { opacity: 0; transform: translateY(10px); }
            100% { opacity: 1; transform: translateY(0); }
          }
        `}</style>
        {/* Branding — ES Express LLC logo */}
        <div className="text-center space-y-3">
          <img
            src="/es-express-logo.png"
            alt="ES Express LLC"
            className="mx-auto h-32 w-auto object-contain drop-shadow-lg"
          />
          <div
            className="h-0.5 bg-primary-container rounded-full mx-auto"
            style={{ animation: "accentGrow 0.8s ease-out 1s both" }}
          />
          <p
            className="text-[10px] font-label font-bold text-on-surface/25 tracking-[0.35em] uppercase"
            style={{ animation: "subtitleFade 0.8s ease-out 1.2s both" }}
          >
            Command Center
          </p>
        </div>

        {/* Login Fields — no card, just fields */}
        <div
          className="space-y-5 max-w-xs mx-auto"
          style={{ animation: "fieldSlide 0.6s ease-out 1.4s both" }}
        >
          {login.isError && (
            <p className="text-sm text-error font-medium text-center">
              {login.error?.message || "Authentication failed."}
            </p>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined icon-filled text-on-surface-variant text-lg">
                mail
              </span>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className="w-full bg-on-surface/[0.06] border border-on-surface/10 rounded-lg px-4 py-3 pl-10 text-sm text-on-surface placeholder:text-on-surface/25 font-body focus:outline-none focus:border-primary-container/50 focus:ring-1 focus:ring-primary-container/30 transition-all"
                required
              />
            </div>

            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined icon-filled text-on-surface-variant text-lg">
                lock
              </span>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full bg-on-surface/[0.06] border border-on-surface/10 rounded-lg px-4 py-3 pl-10 text-sm text-on-surface placeholder:text-on-surface/25 font-body focus:outline-none focus:border-primary-container/50 focus:ring-1 focus:ring-primary-container/30 transition-all"
                required
              />
            </div>

            <button
              type="submit"
              disabled={login.isPending}
              className="w-full bg-primary-container text-on-primary-container py-3 rounded-lg font-bold text-sm uppercase tracking-wider hover:brightness-110 transition-all active:scale-[0.98] shadow-lg shadow-primary-container/25 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
            >
              {login.isPending ? (
                <>
                  <span className="material-symbols-outlined text-sm animate-spin">
                    progress_activity
                  </span>
                </>
              ) : (
                "Sign In"
              )}
            </button>
          </form>

          {/* Magic-link divider + affordance */}
          <div className="pt-2">
            <div className="flex items-center gap-3 my-4">
              <div className="h-px flex-1 bg-on-surface/10" />
              <span className="text-[10px] font-label uppercase tracking-widest text-on-surface/30">
                or
              </span>
              <div className="h-px flex-1 bg-on-surface/10" />
            </div>

            {!magicMode && magicState !== "sent" && (
              <button
                type="button"
                onClick={() => setMagicMode(true)}
                className="w-full bg-surface-container-high border border-on-surface/10 text-on-surface/80 py-3 rounded-lg font-medium text-sm hover:bg-surface-container-highest hover:border-on-surface/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm">mail</span>
                Email me a sign-in link
              </button>
            )}

            {magicMode && magicState !== "sent" && (
              <form className="space-y-3" onSubmit={handleMagicLinkSubmit}>
                <div className="space-y-2">
                  <label
                    htmlFor="magic-email"
                    className="block text-[10px] font-bold font-label uppercase tracking-widest text-on-surface/50"
                  >
                    Email Address
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-on-surface/30 text-lg">
                      mail
                    </span>
                    <input
                      id="magic-email"
                      type="email"
                      value={magicEmail}
                      onChange={(e) => setMagicEmail(e.target.value)}
                      placeholder="you@esexpressllc.com"
                      className="w-full bg-surface-container-high border border-on-surface/10 rounded-lg px-4 py-3 pl-10 text-sm text-on-surface placeholder:text-on-surface/20 font-body focus:outline-none focus:border-primary-container/50 focus:ring-1 focus:ring-primary-container/30 transition-all"
                      required
                      autoFocus
                    />
                  </div>
                </div>

                {magicState === "error" && magicError && (
                  <div className="bg-error/10 border border-error/20 rounded-lg px-3 py-2 text-xs text-error">
                    {magicError}
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMagicMode(false);
                      setMagicEmail("");
                      setMagicError(null);
                      setMagicState("idle");
                    }}
                    className="flex-1 bg-surface-container border border-on-surface/10 text-on-surface/70 py-2.5 rounded-lg font-medium text-sm hover:bg-surface-container-high transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={magicState === "sending" || !magicEmail}
                    className="flex-1 bg-primary-container/90 text-on-primary-container py-2.5 rounded-lg font-bold text-sm hover:brightness-110 transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    {magicState === "sending" ? (
                      <>
                        <span className="material-symbols-outlined text-sm animate-spin">
                          progress_activity
                        </span>
                        Sending...
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-sm">
                          send
                        </span>
                        Send link
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}

            {magicState === "sent" && (
              <div className="bg-success/10 border border-success/20 rounded-lg px-4 py-3 text-sm text-on-surface/80">
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-success text-lg mt-0.5">
                    mark_email_read
                  </span>
                  <div>
                    <p className="font-medium text-on-surface">
                      Check your inbox
                    </p>
                    <p className="text-xs text-on-surface/60 mt-1">
                      If this email is on your account, we've sent you a sign-in
                      link. It expires in 15 minutes.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
