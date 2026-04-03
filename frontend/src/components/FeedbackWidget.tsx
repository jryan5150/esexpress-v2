import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";
import html2canvas from "html2canvas";
import { useSubmitFeedback, useUploadScreenshot } from "../hooks/use-feedback";
import breadcrumbCollector from "../lib/breadcrumb-collector";

type Category = "issue" | "question" | "suggestion";

const CATEGORIES: Array<{ value: Category; label: string; icon: string }> = [
  { value: "issue", label: "Issue", icon: "bug_report" },
  { value: "question", label: "Question", icon: "help" },
  { value: "suggestion", label: "Suggestion", icon: "lightbulb" },
];

export function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<Category | null>(null);
  const [description, setDescription] = useState("");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  const submitMutation = useSubmitFeedback();
  const uploadMutation = useUploadScreenshot();

  useEffect(() => {
    breadcrumbCollector.trackRouteChange(location.pathname);
  }, [location.pathname]);

  useEffect(() => {
    breadcrumbCollector.init();
    return () => breadcrumbCollector.destroy();
  }, []);

  const captureScreenshot = useCallback(async () => {
    setCapturing(true);
    try {
      if (panelRef.current) panelRef.current.style.visibility = "hidden";
      const canvas = await html2canvas(document.body, {
        useCORS: true,
        scale: 0.5,
        logging: false,
        ignoreElements: (el) => el.id === "feedback-widget-root",
      });
      if (panelRef.current) panelRef.current.style.visibility = "visible";
      setScreenshot(canvas.toDataURL("image/jpeg", 0.6));
    } catch {
      setToast({ type: "error", message: "Screenshot capture failed" });
    } finally {
      setCapturing(false);
    }
  }, []);

  useEffect(() => {
    if (open && !screenshot) captureScreenshot();
  }, [open, screenshot, captureScreenshot]);

  const handleClose = () => {
    setOpen(false);
    setCategory(null);
    setDescription("");
    setScreenshot(null);
  };

  const handleSubmit = async () => {
    if (!category || description.length < 3) return;

    let screenshotUrl: string | null = null;
    if (screenshot) {
      try {
        const res = await uploadMutation.mutateAsync(screenshot);
        screenshotUrl = res.url;
      } catch {
        // Continue without screenshot
      }
    }

    submitMutation.mutate(
      {
        category,
        description,
        pageUrl: window.location.href,
        routeName: location.pathname,
        screenshotUrl,
        breadcrumbs: breadcrumbCollector.getBreadcrumbs(),
        sessionSummary: breadcrumbCollector.getSessionSummary(),
        browser: {
          userAgent: navigator.userAgent,
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          platform: navigator.platform,
        },
      },
      {
        onSuccess: () => {
          setToast({ type: "success", message: "Thanks for your feedback!" });
          handleClose();
        },
        onError: () => {
          setToast({ type: "error", message: "Failed to submit. Try again." });
        },
      },
    );
  };

  const isValid = category && description.length >= 3;
  const submitting = submitMutation.isPending || uploadMutation.isPending;

  return (
    <div id="feedback-widget-root" className="fixed bottom-6 right-6 z-50">
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Submit feedback"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-container text-on-primary-container shadow-lg transition-shadow hover:shadow-xl"
        >
          <span className="material-symbols-outlined text-xl">feedback</span>
        </button>
      )}

      {open && (
        <div
          ref={panelRef}
          className="absolute bottom-0 right-0 w-[360px] rounded-xl border border-on-surface/10 bg-surface-container p-5 shadow-2xl"
        >
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-headline text-base font-bold text-on-surface">
              Send Feedback
            </h3>
            <button
              onClick={handleClose}
              aria-label="Close feedback"
              className="text-on-surface/50 hover:text-on-surface"
            >
              <span className="material-symbols-outlined text-lg">close</span>
            </button>
          </div>

          <p className="mb-1.5 font-label text-[10px] font-bold uppercase tracking-widest text-on-surface/30">
            What type of feedback?
          </p>
          <div className="mb-4 flex gap-1.5">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                onClick={() => setCategory(cat.value)}
                className={`flex flex-1 items-center justify-center gap-1 rounded-lg py-2 text-xs font-medium transition-colors ${
                  category === cat.value
                    ? "bg-primary-container/15 text-primary-container"
                    : "bg-surface-container-high/50 text-on-surface/50 hover:text-on-surface/70"
                }`}
              >
                <span className="material-symbols-outlined text-sm">
                  {cat.icon}
                </span>
                {cat.label}
              </button>
            ))}
          </div>

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What's on your mind?"
            maxLength={5000}
            rows={3}
            className="mb-4 w-full resize-none rounded-lg border border-on-surface/10 bg-surface-container-low p-3 text-sm text-on-surface placeholder-on-surface/30 focus:border-primary/50 focus:outline-none"
          />

          <div className="mb-4">
            <div className="mb-1 flex items-center justify-between">
              <span className="font-label text-[10px] font-bold uppercase tracking-widest text-on-surface/30">
                Screenshot
              </span>
              <button
                onClick={captureScreenshot}
                disabled={capturing}
                aria-label="Retake screenshot"
                className="text-on-surface/40 hover:text-on-surface/70"
              >
                <span className="material-symbols-outlined text-sm">
                  {capturing ? "hourglass_empty" : "refresh"}
                </span>
              </button>
            </div>
            {screenshot ? (
              <img
                src={screenshot}
                alt="Page screenshot"
                className="w-full rounded-lg border border-on-surface/10"
              />
            ) : (
              <div
                onClick={captureScreenshot}
                className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed border-on-surface/20 py-4 text-on-surface/30 hover:border-on-surface/40"
              >
                <span className="material-symbols-outlined">photo_camera</span>
                <span className="text-xs">
                  {capturing ? "Capturing..." : "Click to capture"}
                </span>
              </div>
            )}
          </div>

          <button
            onClick={handleSubmit}
            disabled={!isValid || submitting}
            className="w-full rounded-lg bg-primary-container py-2.5 text-sm font-semibold text-on-primary-container transition-opacity disabled:opacity-40"
          >
            {submitting ? "Submitting..." : "Submit Feedback"}
          </button>
        </div>
      )}

      {toast && (
        <div
          className={`fixed bottom-20 right-6 rounded-lg px-4 py-2.5 text-sm font-medium shadow-lg ${
            toast.type === "success"
              ? "bg-tertiary text-on-tertiary"
              : "bg-error text-on-error"
          }`}
        >
          {toast.message}
          <button
            onClick={() => setToast(null)}
            className="ml-3 opacity-70 hover:opacity-100"
          >
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      )}
    </div>
  );
}
