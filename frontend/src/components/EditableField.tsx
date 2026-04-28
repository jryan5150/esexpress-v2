import { useState, useEffect } from "react";

/**
 * EditableField — click-to-edit inline value with Save on Enter or
 * blur, Cancel on Escape. Wires to a parent-supplied async onSave that
 * receives the new string. Empty-string commit lets the parent decide
 * null vs empty semantics.
 *
 * Used in: LoadCenter (Load Values panel), WorkbenchDrawer (per-load
 * inline expand).
 */
export function EditableField({
  label,
  value,
  onSave,
  prefix,
  type,
  size,
  readOnly,
  readOnlyTitle,
}: {
  label: string;
  value: string | null | undefined;
  onSave: (next: string) => Promise<unknown>;
  prefix?: string;
  type?: "text" | "decimal" | "date";
  size?: "sm" | "md";
  /** When true, render value statically — no edit affordance, no
   *  click handler, no "click to add" placeholder. Used to gate by
   *  role (finance/viewer get read-only on dispatch fields). */
  readOnly?: boolean;
  /** Tooltip on the read-only display, e.g. "Read-only — finance role". */
  readOnlyTitle?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(value ?? "");
  }, [value, editing]);

  const commit = async () => {
    if (saving) return;
    const next = draft.trim();
    if ((value ?? "") === next) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(next);
      setEditing(false);
    } catch {
      // parent surfaces the error; keep editing open
    } finally {
      setSaving(false);
    }
  };

  const labelCls =
    size === "sm"
      ? "text-[9px] text-text-secondary uppercase tracking-wide"
      : "text-[10px] text-text-secondary uppercase tracking-wide";
  const valueCls = size === "sm" ? "text-xs" : "text-sm";

  if (readOnly) {
    return (
      <div className={`grid grid-cols-3 gap-2 items-baseline ${valueCls}`}>
        <div className={labelCls}>{label}</div>
        <div
          className="col-span-2 font-medium text-text-secondary"
          title={readOnlyTitle ?? "Read-only"}
        >
          {value ? (
            `${prefix ?? ""}${value}`
          ) : (
            <span className="text-text-secondary italic font-normal">—</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`grid grid-cols-3 gap-2 items-baseline ${valueCls}`}>
      <div className={labelCls}>{label}</div>
      <div className="col-span-2">
        {editing ? (
          <input
            autoFocus
            type={
              type === "decimal" ? "number" : type === "date" ? "date" : "text"
            }
            step={type === "decimal" ? "0.01" : undefined}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              else if (e.key === "Escape") {
                setDraft(value ?? "");
                setEditing(false);
              }
            }}
            onBlur={commit}
            disabled={saving}
            className="w-full px-2 py-0.5 rounded border border-accent bg-bg-primary text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-left font-medium hover:bg-bg-tertiary rounded px-1 -mx-1 transition-colors w-full"
            title="Click to edit"
          >
            {value ? (
              `${prefix ?? ""}${value}`
            ) : (
              <span className="text-text-secondary italic font-normal">
                click to add
              </span>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
