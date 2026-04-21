// frontend/src/components/WellPicker.tsx

import { useState, useRef, useEffect } from "react";
import {
  useWells,
  useWellSuggestions,
  useManualResolve,
  useCreateWell,
  useValidationReject,
} from "../hooks/use-wells";
import { useToast } from "./Toast";
import type { Well } from "../types/api";

interface WellPickerProps {
  loadId: number;
  assignmentId: number | null;
  currentWellId: number | null;
  currentWellName: string;
  onResolved: () => void;
}

export function WellPicker({
  loadId,
  assignmentId,
  currentWellId,
  currentWellName,
  onResolved,
}: WellPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const wellsQuery = useWells();
  const suggestionsQuery = useWellSuggestions(open ? loadId : null);
  const resolveMutation = useManualResolve();
  const rejectMutation = useValidationReject();
  const createWellMutation = useCreateWell();

  const isPending =
    resolveMutation.isPending ||
    rejectMutation.isPending ||
    createWellMutation.isPending;

  // Close on click-away
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
        setCreating(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Focus search input when opening
  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const wells: Well[] = Array.isArray(wellsQuery.data) ? wellsQuery.data : [];
  const suggestions = Array.isArray(suggestionsQuery.data)
    ? suggestionsQuery.data
    : [];

  const filteredWells = search
    ? wells.filter(
        (w) =>
          w.name.toLowerCase().includes(search.toLowerCase()) &&
          w.status === "active",
      )
    : wells.filter((w) => w.status === "active");

  const handleSelect = async (wellId: number) => {
    try {
      // If reassigning (has existing assignment), reject first
      if (assignmentId) {
        await rejectMutation.mutateAsync({
          assignmentId,
          reason: "Reassigned via well picker",
        });
      }
      // Then resolve to new well
      await resolveMutation.mutateAsync({ loadId, wellId });
      toast("Well assigned", "success");
      setOpen(false);
      setSearch("");
      onResolved();
    } catch (err) {
      toast(`Assignment failed: ${(err as Error).message}`, "error");
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      const well = await createWellMutation.mutateAsync({
        name: newName.trim(),
      });
      setCreating(false);
      setNewName("");
      // Auto-select the new well
      await handleSelect((well as any).id ?? (well as any).data?.id);
    } catch (err) {
      toast(`Create failed: ${(err as Error).message}`, "error");
    }
  };

  const isUnresolved = currentWellId === 0 || currentWellId === null;

  if (!open) {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className={`text-sm font-bold truncate max-w-[140px] cursor-pointer transition-colors ${
          isUnresolved
            ? "text-error hover:text-error/80 underline decoration-dashed"
            : "text-on-surface hover:text-primary-container underline decoration-transparent hover:decoration-primary-container/50"
        }`}
        title={isUnresolved ? "Click to assign well" : "Click to reassign"}
      >
        {currentWellName}
      </button>
    );
  }

  return (
    <div
      ref={ref}
      className="relative z-50"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Search input */}
      <input
        ref={inputRef}
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            setSearch("");
          }
        }}
        placeholder="Search wells..."
        className="w-48 bg-surface-container-high border border-primary-container/50 rounded-lg px-3 py-1.5 text-sm text-on-surface font-label focus:outline-none focus:ring-1 focus:ring-primary-container/50"
        disabled={isPending}
      />

      {/* Dropdown */}
      <div className="absolute top-full left-0 mt-1 w-64 max-h-72 overflow-y-auto bg-surface-container-lowest border border-on-surface/10 rounded-xl shadow-2xl">
        {/* Suggestions section */}
        {suggestions.length > 0 && (
          <>
            <div className="px-3 py-2 text-[10px] uppercase tracking-widest font-bold text-on-surface-variant border-b border-on-surface/5">
              Suggested
            </div>
            {suggestions.slice(0, 5).map((s) => (
              <button
                key={s.wellId}
                onClick={() => handleSelect(s.wellId)}
                disabled={isPending}
                className="w-full text-left px-3 py-2.5 hover:bg-surface-container-high transition-colors cursor-pointer flex items-center justify-between disabled:opacity-50"
              >
                <span className="text-sm text-on-surface font-label truncate">
                  {s.wellName}
                </span>
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    s.score >= 0.9
                      ? "text-tertiary bg-tertiary/10"
                      : s.score >= 0.7
                        ? "text-primary-container bg-primary-container/10"
                        : "text-on-surface-variant bg-on-surface/5"
                  }`}
                >
                  {Math.round(s.score * 100)}%
                </span>
              </button>
            ))}
          </>
        )}

        {/* All wells section */}
        <div className="px-3 py-2 text-[10px] uppercase tracking-widest font-bold text-on-surface-variant border-b border-on-surface/5">
          {search ? `Results` : "All Wells"} ({filteredWells.length})
        </div>
        {filteredWells.slice(0, 20).map((w) => (
          <button
            key={w.id}
            onClick={() => handleSelect(w.id)}
            disabled={isPending || w.id === currentWellId}
            className={`w-full text-left px-3 py-2 hover:bg-surface-container-high transition-colors cursor-pointer text-sm font-label disabled:opacity-30 ${
              w.id === currentWellId
                ? "text-on-surface-variant"
                : "text-on-surface"
            }`}
          >
            {w.name}
          </button>
        ))}
        {filteredWells.length > 20 && (
          <div className="px-3 py-2 text-[10px] text-on-surface-variant text-center">
            Type to narrow results...
          </div>
        )}

        {/* Create new well */}
        <div className="border-t border-on-surface/5">
          {creating ? (
            <div className="px-3 py-2 flex items-center gap-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                  if (e.key === "Escape") {
                    setCreating(false);
                    setNewName("");
                  }
                }}
                placeholder="Well name..."
                className="flex-1 bg-surface-container-high border border-on-surface/10 rounded px-2 py-1.5 text-xs text-on-surface font-label focus:outline-none focus:border-primary-container/50"
                autoFocus
                disabled={isPending}
              />
              <button
                onClick={handleCreate}
                disabled={!newName.trim() || isPending}
                className="text-tertiary text-xs font-bold cursor-pointer hover:underline disabled:opacity-50"
              >
                Create
              </button>
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              disabled={isPending}
              className="w-full text-left px-3 py-2.5 text-sm text-primary-container font-bold hover:bg-surface-container-high transition-colors cursor-pointer flex items-center gap-2 disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-sm">add</span>
              Create New Well
            </button>
          )}
        </div>

        {/* Loading indicator */}
        {isPending && (
          <div className="px-3 py-2 text-center">
            <span className="text-[10px] text-on-surface-variant animate-pulse">
              Assigning...
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
