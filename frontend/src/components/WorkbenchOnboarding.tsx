import { useEffect, useState } from "react";

const STORAGE_KEY = "workbench_onboarding_v5_seen";

type Role = "jess" | "builder" | "keli" | "clearer" | "other";

interface Step {
  target?: string;
  text: string;
}

const STEPS: Record<Role, Step[]> = {
  jess: [
    {
      target: '[data-filter="uncertain"]',
      text: "Good morning. Today you have uncertain loads — these are the only ones that need you.",
    },
    {
      target: "[data-workbench-row]",
      text: "Click a row to resolve. Each one shows exactly why it's on your list — missing well, weight mismatch, no photo, etc.",
    },
    {
      target: "[data-stage-pill]",
      text: "When you resolve, it moves to Ready to Build. Your team sees it next.",
    },
    {
      target: "[data-handler-stripe]",
      text: "Your color stripe is green. When you see green, it's on your plate. Other colors mean it's someone else's turn.",
    },
    {
      target: '[data-filter="entered_today"]',
      text: "When you're done with Uncertain, the day's done for you. Check Entered Today to see the team's progress.",
    },
  ],
  builder: [
    {
      target: '[data-filter="ready_to_build"]',
      text: "Open Ready to Build — these are the loads Jessica released to you.",
    },
    {
      target: "[data-primary-action]",
      text: "Click any row. Then Build + Duplicate — same pattern you use in PCS, faster.",
    },
    {
      target: "[data-batch-bar]",
      text: "Select multiple loads first? Batch duplicate — build the template once, duplicate for every load on the well.",
    },
    {
      text: "j and k to navigate. Enter to build. Shift+E to mark entered.",
    },
    {
      target: "[data-handler-stripe]",
      text: "Your color stripe is blue. When you've typed a load into PCS, Mark Entered. Stripe turns teal — Katie's color — and she knows to verify it.",
    },
  ],
  keli: [
    {
      target: '[data-filter="ready_to_build"]',
      text: "Keli — Ready to Build is where your JRT loads land after Jessica releases them.",
    },
    {
      target: "[data-primary-action]",
      text: "Click any row, then Build + Duplicate. Same PCS pattern, just faster because the well, driver, and weight are already there.",
    },
    {
      target: "[data-batch-bar]",
      text: "Selecting multiple JRT loads on the same well? Batch duplicate — one template, every load at that well in one shot.",
    },
    {
      text: "j/k to step through the queue. Enter to build. Shift+E to mark entered once it's in PCS.",
    },
    {
      target: "[data-handler-stripe]",
      text: "Your stripe is blue while it's yours. Mark Entered flips it to Katie's color so she knows to verify.",
    },
  ],
  clearer: [
    {
      target: '[data-filter="ready_to_clear"]',
      text: "Open Ready to Clear — loads Steph, Scout, or Keli built, now in PCS, ready for you to verify.",
    },
    {
      target: "[data-load-no]",
      text: "Each row shows the PCS load number so you can pull it up directly. No hunting.",
    },
    {
      target: "[data-primary-action]",
      text: "When verified, click Mark Cleared. Jenny takes it for settlement.",
    },
    {
      text: "Flag any load back to Jessica if something's off — she sees it on her Uncertain list immediately.",
    },
  ],
  other: [
    {
      target: '[data-filter="all"]',
      text: "Welcome. Workbench is one page for the whole dispatch flow. Filter by stage or see everything.",
    },
    {
      target: "[data-handler-stripe]",
      text: "Each load's left stripe shows whose turn it is. Check Mine to see loads on you.",
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

  const close = (markSeen: boolean) => {
    if (markSeen && typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, "true");
    }
    setOpen(false);
    onClose();
  };

  if (!open || steps.length === 0) return null;
  const step = steps[index];
  const last = index === steps.length - 1;

  return (
    <div className="fixed inset-0 bg-black/50 z-40 pointer-events-none">
      <div className="pointer-events-auto absolute bottom-6 left-1/2 -translate-x-1/2 w-[420px] max-w-[92vw] bg-surface p-5 rounded-lg shadow-lg border border-primary/40 space-y-3">
        <div className="flex items-start justify-between">
          <div className="text-xs text-primary font-medium">
            Walkthrough — step {index + 1} of {steps.length}
          </div>
          <button
            type="button"
            onClick={() => close(true)}
            className="text-xs text-on-surface-variant hover:text-on-surface"
          >
            Skip
          </button>
        </div>
        <p className="text-sm">{step.text}</p>
        <div className="flex justify-between pt-1">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => setIndex((i) => i - 1)}
            className="text-sm text-on-surface-variant disabled:opacity-30"
          >
            Back
          </button>
          {last ? (
            <button
              type="button"
              onClick={() => close(true)}
              className="px-3 py-1 text-sm rounded bg-primary text-on-primary"
            >
              Got it
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIndex((i) => i + 1)}
              className="px-3 py-1 text-sm rounded bg-primary text-on-primary"
            >
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
