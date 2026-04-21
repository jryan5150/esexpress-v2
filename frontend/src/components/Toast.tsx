import {
  useState,
  useCallback,
  createContext,
  useContext,
  type ReactNode,
} from "react";

interface ToastMessage {
  id: number;
  message: string;
  variant: "success" | "error" | "info";
}

interface ToastContextType {
  toast: (message: string, variant?: "success" | "error" | "info") => void;
}

const ToastContext = createContext<ToastContextType>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

const VARIANT_STYLES: Record<string, string> = {
  success: "bg-tertiary/10 border-tertiary/30 text-tertiary",
  error: "bg-error/10 border-error/30 text-error",
  info: "bg-primary/10 border-primary/30 text-primary",
};

let nextId = 0;

// Module-level ref so non-React code (e.g. React Query's MutationCache) can
// surface errors through the toast system. ToastProvider registers its
// toast() fn on mount; callers fall through to console if no provider is
// mounted yet (rare — provider wraps the whole app).
type ToastFn = (
  message: string,
  variant?: "success" | "error" | "info",
) => void;
let globalToastFn: ToastFn | null = null;

export function notify(
  message: string,
  variant: "success" | "error" | "info" = "info",
): void {
  if (globalToastFn) globalToastFn(message, variant);
  else console.log(`[toast:${variant}]`, message);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ToastMessage[]>([]);

  const toast = useCallback(
    (message: string, variant: "success" | "error" | "info" = "success") => {
      const id = ++nextId;
      setMessages((prev) => [...prev, { id, message, variant }]);
      if (variant !== "error") {
        setTimeout(
          () => setMessages((prev) => prev.filter((m) => m.id !== id)),
          4000,
        );
      }
    },
    [],
  );

  // Register this toast fn on mount; clear on unmount so stale refs can't
  // fire into an unmounted tree.
  globalToastFn = toast;
  const dismiss = useCallback((id: number) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        className="fixed bottom-6 right-6 z-50 space-y-2 max-w-sm"
        aria-live="polite"
      >
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg shadow-black/10 backdrop-blur-sm cursor-pointer transition-all hover:scale-[1.02] animate-slide-in-right ${VARIANT_STYLES[msg.variant]}`}
            onClick={() => dismiss(msg.id)}
          >
            <span className="material-symbols-outlined text-sm">
              {msg.variant === "success"
                ? "check_circle"
                : msg.variant === "error"
                  ? "error"
                  : "info"}
            </span>
            <span className="text-sm font-headline font-medium">
              {msg.message}
            </span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
