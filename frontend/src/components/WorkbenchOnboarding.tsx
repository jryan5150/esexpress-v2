import { useEffect, useLayoutEffect, useRef, useState } from "react";

const STORAGE_KEY = "workbench_onboarding_v6_seen";

type Role = "jess" | "builder" | "keli" | "clearer" | "other";

interface Step {
  target?: string;
  title: string;
  body: string;
  hint?: string;
}

/**
 * Cave-man simple walkthrough. Each step points at exactly one element and
 * says in plain words what it does. Anchored spotlight — dim everything
 * else, pulse a ring on the target, drop a card right next to it with a
 * clear Next button. Auto-fires once per user on first visit; replay link
 * lives in the Workbench header.
 */
const STEPS: Record<Role, Step[]> = {
  jess: [
    {
      title: "Welcome to Workbench",
      body: "One screen for your whole day. 30-second tour — you can skip any time.",
    },
    {
      target: '[data-filter="uncertain"]',
      title: "Start here — Uncertain",
      body: "These are the only loads that need you. Click Uncertain to see today's list.",
      hint: "Click this tab",
    },
    {
      target: "[data-workbench-row]",
      title: "Click a row to open it",
      body: "Each row is one load. Click anywhere on it — the detail panel opens below.",
      hint: "Click a load row",
    },
    {
      target: "[data-ocr-accept]",
      title: "Use OCR or Keep",
      body: "When our BOL read disagrees with the load, these two buttons appear. Use OCR replaces the value with what we read. Keep leaves it alone.",
      hint: "Pick one when they appear",
    },
    {
      target: "[data-pcs-number]",
      title: "PCS Number",
      body: "Once a load is built in PCS, paste the PCS number here. This links our side to theirs.",
      hint: "Click to enter the number",
    },
    {
      target: "[data-flag-button]",
      title: "Flag back if something's wrong",
      body: "Not sure? Can't build it? Click Flag — you'll type a reason and it bounces back to Uncertain.",
      hint: "Escape hatch",
    },
    {
      target: "[data-primary-action]",
      title: "Advance the load",
      body: "When you're done with this one, the primary button moves it to the next stage — your team picks it up from there.",
      hint: "Blue button",
    },
    {
      target: "[data-show-walkthrough]",
      title: "Replay any time",
      body: "This link re-runs the tour. You're set — check Uncertain and work the list.",
      hint: "You're done",
    },
  ],
  builder: [
    {
      title: "Welcome, builder",
      body: "Your queue is Ready to Build. 30-second tour.",
    },
    {
      target: '[data-filter="ready_to_build"]',
      title: "Your queue — Ready to Build",
      body: "Jessica releases loads here. Everything you see is ready for PCS.",
      hint: "Click this tab",
    },
    {
      target: "[data-workbench-row]",
      title: "Open any load",
      body: "Click a row. The well, driver, and weight are already filled in for PCS.",
      hint: "Click a load row",
    },
    {
      target: "[data-primary-action]",
      title: "Build + Duplicate",
      body: "Primary action builds the load in PCS with the pre-wired data. Duplicate copies it for the next load on the same well.",
      hint: "Blue button",
    },
    {
      target: "[data-pcs-number]",
      title: "Paste PCS # after build",
      body: "Once PCS gives you a load number, paste it here. That's how it links back.",
      hint: "Click to enter",
    },
    {
      target: "[data-show-walkthrough]",
      title: "Replay any time",
      body: "You're set. Work the Ready to Build list top-down.",
      hint: "You're done",
    },
  ],
  keli: [
    {
      title: "Welcome, Keli",
      body: "JRT loads land in Ready to Build after Jessica releases them.",
    },
    {
      target: '[data-filter="ready_to_build"]',
      title: "Your queue — Ready to Build",
      body: "Everything here is pre-wired for PCS. Well, driver, weight — all filled in.",
      hint: "Click this tab",
    },
    {
      target: "[data-workbench-row]",
      title: "Open any load",
      body: "Click a row to see the details and act on it.",
      hint: "Click a load row",
    },
    {
      target: "[data-primary-action]",
      title: "Build + Duplicate",
      body: "Same pattern you use in PCS — faster because the fields are already there.",
      hint: "Blue button",
    },
    {
      target: "[data-pcs-number]",
      title: "PCS #",
      body: "After building in PCS, paste the load number here.",
      hint: "Click to enter",
    },
    {
      target: "[data-show-walkthrough]",
      title: "Replay any time",
      body: "You're set. Work the list.",
      hint: "You're done",
    },
  ],
  clearer: [
    {
      title: "Welcome",
      body: "Ready to Clear is your queue. 30-second tour.",
    },
    {
      target: '[data-filter="ready_to_clear"]',
      title: "Your queue — Ready to Clear",
      body: "Loads built in PCS, ready for you to verify.",
      hint: "Click this tab",
    },
    {
      target: "[data-workbench-row]",
      title: "Open any load",
      body: "Click a row. Each shows the PCS load number directly.",
      hint: "Click a load row",
    },
    {
      target: "[data-primary-action]",
      title: "Mark Cleared",
      body: "Verified in PCS? Click the primary button. It moves to settlement.",
      hint: "Blue button",
    },
    {
      target: "[data-flag-button]",
      title: "Flag back if something's off",
      body: "Wrong data? Click Flag — it bounces back to Jessica with your reason.",
      hint: "Escape hatch",
    },
    {
      target: "[data-show-walkthrough]",
      title: "Replay any time",
      body: "You're set. Clear the list top-down.",
      hint: "You're done",
    },
  ],
  other: [
    {
      title: "Welcome to Workbench",
      body: "One screen for the whole dispatch flow.",
    },
    {
      target: '[data-filter="all"]',
      title: "Filter tabs",
      body: "Each tab is a stage. Click one to narrow the list.",
      hint: "Click a tab",
    },
    {
      target: "[data-workbench-row]",
      title: "Click a row to open it",
      body: "Detail panel opens below the row. Edit in place.",
      hint: "Click a load row",
    },
    {
      target: "[data-show-walkthrough]",
      title: "Replay any time",
      body: "This link re-opens the tour.",
      hint: "You're done",
    },
  ],
};

function resolveRole(
  userName: string | null | undefined,
  userRole: string | null | undefined,
): Role {
  const n = (userName ?? "").toLowerCase();
  if (n.includes("jess") || userRole === "jess") return "jess";
  if (n.includes("keli") || userRole === "keli") return "keli";
  if (n.includes("steph") || n.includes("scout") || userRole === "builder")
    return "builder";
  if (n.includes("katie") || userRole === "clearer") return "clearer";
  return "other";
}

const CARD_WIDTH = 340;
const CARD_GAP = 16;
const RING_PAD = 6;

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface WorkbenchOnboardingProps {
  userName: string | null | undefined;
  userRole: string | null | undefined;
  forceOpen?: boolean;
  onClose: () => void;
}

export function WorkbenchOnboarding({
  userName,
  userRole,
  forceOpen,
  onClose,
}: WorkbenchOnboardingProps) {
  const role = resolveRole(userName, userRole);
  const steps = STEPS[role];

  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [viewport, setViewport] = useState(() => ({
    w: typeof window === "undefined" ? 1280 : window.innerWidth,
    h: typeof window === "undefined" ? 800 : window.innerHeight,
  }));
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [cardHeight, setCardHeight] = useState(180);

  useEffect(() => {
    if (forceOpen) {
      setOpen(true);
      setIndex(0);
      return;
    }
    if (typeof window === "undefined") return;
    const seen = window.localStorage.getItem(STORAGE_KEY) === "true";
    if (!seen) setOpen(true);
  }, [forceOpen]);

  const step = open && steps.length > 0 ? steps[index] : null;

  // Find and measure the target for the current step. Scroll it into view
  // first so measurements happen at the final scroll position. Re-measure
  // on resize, scroll, and every 300ms (cheap) to survive layout shifts
  // from the drawer opening/closing.
  useLayoutEffect(() => {
    if (!step) {
      setRect(null);
      return;
    }
    if (!step.target) {
      setRect(null);
      return;
    }

    let cancelled = false;

    const measure = () => {
      if (cancelled) return;
      const el = document.querySelector<HTMLElement>(step.target!);
      if (!el) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) {
        setRect(null);
        return;
      }
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };

    // Scroll target into view once, then measure.
    const el = document.querySelector<HTMLElement>(step.target);
    if (el) {
      try {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
      } catch {
        el.scrollIntoView();
      }
    }

    // Initial measure slightly delayed so scroll completes.
    const t0 = window.setTimeout(measure, 60);
    const t1 = window.setInterval(measure, 300);

    const onResize = () => {
      setViewport({ w: window.innerWidth, h: window.innerHeight });
      measure();
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", measure, true);

    return () => {
      cancelled = true;
      window.clearTimeout(t0);
      window.clearInterval(t1);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step]);

  // Keep card height in state so we can flip above/below correctly.
  useLayoutEffect(() => {
    if (cardRef.current) {
      setCardHeight(cardRef.current.offsetHeight);
    }
  }, [step, rect, index]);

  const close = (markSeen: boolean) => {
    if (markSeen && typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, "true");
    }
    setOpen(false);
    onClose();
  };

  const next = () => setIndex((i) => Math.min(steps.length - 1, i + 1));
  const back = () => setIndex((i) => Math.max(0, i - 1));

  if (!open || !step) return null;

  const last = index === steps.length - 1;

  // Card position: prefer below target, else above, else center.
  let cardTop: number;
  let cardLeft: number;
  let arrowPos: "top" | "bottom" | null = null;

  if (rect) {
    const spaceBelow = viewport.h - rect.top - rect.height;
    const spaceAbove = rect.top;
    if (spaceBelow >= cardHeight + CARD_GAP + 20) {
      cardTop = rect.top + rect.height + CARD_GAP;
      arrowPos = "top";
    } else if (spaceAbove >= cardHeight + CARD_GAP + 20) {
      cardTop = rect.top - cardHeight - CARD_GAP;
      arrowPos = "bottom";
    } else {
      cardTop = Math.max(16, viewport.h - cardHeight - 16);
      arrowPos = null;
    }
    // Horizontally: align card's center with target's center, clamp to viewport.
    const targetCenter = rect.left + rect.width / 2;
    cardLeft = Math.max(
      16,
      Math.min(viewport.w - CARD_WIDTH - 16, targetCenter - CARD_WIDTH / 2),
    );
  } else {
    cardTop = viewport.h / 2 - cardHeight / 2;
    cardLeft = viewport.w / 2 - CARD_WIDTH / 2;
  }

  // Build the 4 dim rects that frame the target. Clicks on these are absorbed.
  const dimRects = rect
    ? [
        // top
        {
          top: 0,
          left: 0,
          width: viewport.w,
          height: Math.max(0, rect.top - RING_PAD),
        },
        // bottom
        {
          top: rect.top + rect.height + RING_PAD,
          left: 0,
          width: viewport.w,
          height: Math.max(0, viewport.h - (rect.top + rect.height + RING_PAD)),
        },
        // left
        {
          top: Math.max(0, rect.top - RING_PAD),
          left: 0,
          width: Math.max(0, rect.left - RING_PAD),
          height: rect.height + RING_PAD * 2,
        },
        // right
        {
          top: Math.max(0, rect.top - RING_PAD),
          left: rect.left + rect.width + RING_PAD,
          width: Math.max(0, viewport.w - (rect.left + rect.width + RING_PAD)),
          height: rect.height + RING_PAD * 2,
        },
      ]
    : null;

  return (
    <div className="fixed inset-0 z-[60]" aria-live="polite">
      {/* Full-screen dim fallback when no target */}
      {!rect && (
        <div className="absolute inset-0 bg-black/60 pointer-events-auto" />
      )}

      {/* Four dim rects forming a cutout around the target */}
      {dimRects &&
        dimRects.map((r, i) => (
          <div
            key={i}
            className="absolute bg-black/60 pointer-events-auto"
            style={{
              top: r.top,
              left: r.left,
              width: r.width,
              height: r.height,
            }}
          />
        ))}

      {/* Pulse ring around target */}
      {rect && (
        <div
          data-wb-onboard-ring
          className="absolute pointer-events-none rounded-lg"
          style={{
            top: rect.top - RING_PAD,
            left: rect.left - RING_PAD,
            width: rect.width + RING_PAD * 2,
            height: rect.height + RING_PAD * 2,
            boxShadow: "0 0 0 3px #ff6b2c, 0 0 24px 4px rgba(255,107,44,0.45)",
            animation: "wb-onboard-pulse 1.6s ease-in-out infinite",
          }}
        />
      )}

      {/* Pulse keyframes injected inline. Respects prefers-reduced-motion
          per WCAG 2.3.3 — static ring if the user has motion reduction on. */}
      <style>{`
        @keyframes wb-onboard-pulse {
          0%, 100% { box-shadow: 0 0 0 3px #ff6b2c, 0 0 0 0 rgba(255,107,44,0.45); }
          50% { box-shadow: 0 0 0 3px #ff6b2c, 0 0 32px 8px rgba(255,107,44,0.55); }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-wb-onboard-ring] { animation: none !important; }
        }
      `}</style>

      {/* Card */}
      <div
        ref={cardRef}
        className="absolute bg-surface rounded-xl shadow-2xl border-2 border-primary/40 pointer-events-auto"
        style={{
          top: cardTop,
          left: cardLeft,
          width: CARD_WIDTH,
          maxWidth: "calc(100vw - 32px)",
        }}
      >
        {/* Arrow */}
        {arrowPos === "top" && (
          <div
            className="absolute w-0 h-0"
            style={{
              top: -10,
              left: Math.max(
                16,
                Math.min(
                  CARD_WIDTH - 32,
                  (rect ? rect.left + rect.width / 2 : CARD_WIDTH / 2) -
                    cardLeft -
                    10,
                ),
              ),
              borderLeft: "10px solid transparent",
              borderRight: "10px solid transparent",
              borderBottom: "10px solid #ff6b2c",
            }}
          />
        )}
        {arrowPos === "bottom" && (
          <div
            className="absolute w-0 h-0"
            style={{
              bottom: -10,
              left: Math.max(
                16,
                Math.min(
                  CARD_WIDTH - 32,
                  (rect ? rect.left + rect.width / 2 : CARD_WIDTH / 2) -
                    cardLeft -
                    10,
                ),
              ),
              borderLeft: "10px solid transparent",
              borderRight: "10px solid transparent",
              borderTop: "10px solid #ff6b2c",
            }}
          />
        )}

        <div className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded">
                {index + 1} of {steps.length}
              </span>
              {step.hint && (
                <span className="text-[10px] uppercase tracking-wider text-on-surface-variant font-medium">
                  {step.hint}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => close(true)}
              className="text-[11px] text-on-surface-variant hover:text-on-surface uppercase tracking-wider font-medium"
            >
              Skip tour
            </button>
          </div>

          <div className="space-y-1.5">
            <h3 className="font-headline text-lg leading-tight text-on-surface">
              {step.title}
            </h3>
            <p className="text-sm text-on-surface-variant leading-relaxed">
              {step.body}
            </p>
          </div>

          {/* Progress dots */}
          <div className="flex gap-1 pt-1">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  i === index
                    ? "bg-primary"
                    : i < index
                      ? "bg-primary/40"
                      : "bg-surface-variant"
                }`}
              />
            ))}
          </div>

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              disabled={index === 0}
              onClick={back}
              className="text-sm text-on-surface-variant hover:text-on-surface disabled:opacity-30 disabled:pointer-events-none"
            >
              ← Back
            </button>
            {last ? (
              <button
                type="button"
                onClick={() => close(true)}
                className="px-5 py-2 text-sm font-semibold rounded-lg bg-primary text-on-primary hover:opacity-90 shadow-sm"
              >
                Got it
              </button>
            ) : (
              <button
                type="button"
                onClick={next}
                className="px-5 py-2 text-sm font-semibold rounded-lg bg-primary text-on-primary hover:opacity-90 shadow-sm"
              >
                Next →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
