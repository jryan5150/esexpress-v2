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

let nextId = 0;

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

  const dismiss = useCallback((id: number) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const variantStyles: Record<string, string> = {
    success: "bg-tertiary/10 border-tertiary/30 text-tertiary",
    error: "bg-error/10 border-error/30 text-error",
    info: "bg-primary/10 border-primary/30 text-primary",
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-6 right-6 z-50 space-y-2 max-w-sm">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg shadow-black/10 cursor-pointer transition-all hover:scale-[1.02] animate-slide-in-right ${variantStyles[msg.variant]}`}
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
