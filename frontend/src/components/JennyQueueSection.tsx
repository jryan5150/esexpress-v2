import { useState } from "react";

export function JennyQueueSection() {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-lg border border-border bg-bg-secondary">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-bg-tertiary"
      >
        <span className="text-sm font-semibold uppercase tracking-wide">
          Jenny's Queue
        </span>
        <span className="text-xs text-text-secondary">
          {open ? "Collapse ↑" : "Expand ↓"}
        </span>
      </button>
      {open && (
        <div className="p-4 border-t border-border text-sm text-text-secondary">
          Stub — filled in Task 7.
        </div>
      )}
    </section>
  );
}
