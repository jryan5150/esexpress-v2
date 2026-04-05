import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useLogin } from "../hooks/use-auth";

/**
 * Animated title where individual letters randomly fade in/out
 * at staggered intervals, creating a subtle breathing effect.
 */
function GhostTitle({ text, className }: { text: string; className?: string }) {
  const [opacities, setOpacities] = useState<number[]>(() =>
    Array(text.length).fill(0),
  );
  const timers = useRef<number[]>([]);
  const mounted = useRef(true);

  // Initial fade-in: each letter fades in with a stagger
  useEffect(() => {
    mounted.current = true;
    text.split("").forEach((_, i) => {
      const delay = 300 + i * 80;
      const t = window.setTimeout(() => {
        if (!mounted.current) return;
        setOpacities((prev) => {
          const next = [...prev];
          next[i] = 1;
          return next;
        });
      }, delay);
      timers.current.push(t);
    });
    return () => {
      mounted.current = false;
      timers.current.forEach(clearTimeout);
    };
  }, [text]);

  // After initial fade-in, start random breathing per letter
  const startBreathing = useCallback(() => {
    if (!mounted.current) return;

    const breathe = (index: number) => {
      if (!mounted.current) return;
      // Random interval: 2-6 seconds
      const interval = 2000 + Math.random() * 4000;
      const t = window.setTimeout(() => {
        if (!mounted.current) return;
        // Dim to 0.25-0.5, then return to full
        const dimTo = 0.25 + Math.random() * 0.25;
        setOpacities((prev) => {
          const next = [...prev];
          next[index] = dimTo;
          return next;
        });
        const restore = window.setTimeout(
          () => {
            if (!mounted.current) return;
            setOpacities((prev) => {
              const next = [...prev];
              next[index] = 1;
              return next;
            });
            breathe(index);
          },
          800 + Math.random() * 600,
        );
        timers.current.push(restore);
      }, interval);
      timers.current.push(t);
    };

    text.split("").forEach((_, i) => {
      // Stagger breathing start so letters aren't synchronized
      const startDelay = 1500 + Math.random() * 3000;
      const t = window.setTimeout(() => breathe(i), startDelay);
      timers.current.push(t);
    });
  }, [text]);

  // Start breathing after initial fade-in completes
  useEffect(() => {
    const totalFadeIn = 300 + text.length * 80 + 400;
    const t = window.setTimeout(startBreathing, totalFadeIn);
    return () => clearTimeout(t);
  }, [text, startBreathing]);

  return (
    <span className={className} aria-label={text}>
      {text.split("").map((char, i) => (
        <span
          key={i}
          style={{
            opacity: opacities[i] ?? 0,
            transition: "opacity 0.8s ease-in-out",
            display: "inline-block",
            minWidth: char === " " ? "0.3em" : undefined,
          }}
        >
          {char}
        </span>
      ))}
    </span>
  );
}

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
        {/* Branding — Typographic Monogram */}
        <div className="text-center space-y-3">
          <h1 className="text-7xl font-black font-headline tracking-tighter leading-none">
            <span className="text-primary-container">Es</span>
            <GhostTitle text="Express" className="text-on-surface/[0.25]" />
          </h1>
          <div className="w-10 h-0.5 bg-primary-container rounded-full mx-auto" />
          <p className="text-[10px] font-label font-bold text-on-surface/25 tracking-[0.35em] uppercase">
            Command Center
          </p>
        </div>

        {/* Login Card */}
        <div className="glass rounded-xl p-8 border border-on-surface/8 shadow-2xl shadow-black/15 space-y-6 accent-line">
          <h2 className="text-lg font-bold font-headline text-on-surface tracking-tight">
            Sign In
          </h2>

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
                Email / Username
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
                  placeholder="you@esexpressllc.com"
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
                Password
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
                  placeholder="Enter password"
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
