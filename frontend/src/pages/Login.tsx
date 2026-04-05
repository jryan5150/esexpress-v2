import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useLogin } from "../hooks/use-auth";

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
        opacity: Math.random() * 0.3 + 0.05,
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
            ctx!.strokeStyle = `rgba(124, 58, 237, ${0.06 * (1 - dist / 150)})`;
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
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      <ParticleBackground />

      {/* Gradient overlays */}
      <div className="fixed inset-0 bg-gradient-to-br from-primary-container/5 via-transparent to-tertiary/5 pointer-events-none" />
      <div className="fixed bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-background to-transparent pointer-events-none" />

      <div className="w-full max-w-md space-y-8 relative z-10">
        {/* Branding */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-primary-container rounded-2xl border border-primary/30 mx-auto shadow-2xl shadow-primary-container/30">
            <img
              src="/trailer-icon.svg"
              alt="ES Express"
              className="w-12 h-12"
              style={{ filter: "brightness(0) invert(1)" }}
            />
          </div>
          <div className="space-y-1">
            <h1 className="text-4xl font-black font-headline tracking-tighter text-on-surface uppercase">
              EsExpress
            </h1>
            <p className="text-[11px] font-label font-medium text-on-surface/30 tracking-[0.2em] uppercase">
              Logistics Command Center
            </p>
          </div>
        </div>

        {/* Login Card */}
        <div className="glass rounded-xl p-8 border border-on-surface/8 shadow-2xl shadow-black/15 space-y-6 accent-line">
          <div className="space-y-1">
            <h2 className="text-lg font-bold font-headline text-on-surface tracking-tight">
              Operator Sign-In
            </h2>
            <p className="text-[11px] text-on-surface/35 font-body">
              Authenticate to access dispatch operations
            </p>
          </div>

          {login.isError && (
            <div className="bg-error/8 border border-error/15 rounded-lg px-4 py-3 flex items-center gap-3">
              <span className="material-symbols-outlined icon-filled text-error text-lg">
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
                className="block text-[10px] font-bold font-label uppercase tracking-widest text-on-surface/30"
              >
                Operator Email
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined icon-filled text-on-surface/25 text-lg">
                  mail
                </span>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="operator@esexpressllc.com"
                  className="w-full bg-surface-container-high border border-on-surface/10 rounded-lg px-4 py-3 pl-10 text-sm text-on-surface placeholder:text-on-surface/20 font-body focus:outline-none focus:border-primary-container/50 focus:ring-1 focus:ring-primary-container/30 transition-all pressed-metal"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="password"
                className="block text-[10px] font-bold font-label uppercase tracking-widest text-on-surface/30"
              >
                Access Key
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined icon-filled text-on-surface/25 text-lg">
                  lock
                </span>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter access key"
                  className="w-full bg-surface-container-high border border-on-surface/10 rounded-lg px-4 py-3 pl-10 text-sm text-on-surface placeholder:text-on-surface/20 font-body focus:outline-none focus:border-primary-container/50 focus:ring-1 focus:ring-primary-container/30 transition-all pressed-metal"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={login.isPending}
              className="w-full bg-primary-container text-on-primary-container py-3.5 rounded-lg font-bold text-sm uppercase tracking-wider hover:brightness-110 transition-all active:scale-[0.98] shadow-lg shadow-primary-container/30 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
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
                  Sign In
                  <span className="material-symbols-outlined icon-filled text-sm">
                    arrow_forward
                  </span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <div className="text-center space-y-2">
          <p className="text-[10px] text-on-surface/20 font-data tracking-[0.15em] uppercase">
            ES Express LLC // Secure Access Portal
          </p>
        </div>
      </div>
    </div>
  );
}
