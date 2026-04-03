import { useState } from "react";
import { BreadcrumbTimeline } from "../components/BreadcrumbTimeline";
import { useFeedbackList, useFeedbackDetail } from "../hooks/use-feedback";
import type { FeedbackItem } from "../lib/api";

type CategoryFilter = "all" | "issue" | "question" | "suggestion";

const filterTabs: { label: string; value: CategoryFilter }[] = [
  { label: "All", value: "all" },
  { label: "Issues", value: "issue" },
  { label: "Questions", value: "question" },
  { label: "Suggestions", value: "suggestion" },
];

const categoryStyle: Record<string, string> = {
  issue: "bg-error/15 text-error",
  question: "bg-secondary/15 text-secondary",
  suggestion: "bg-tertiary/15 text-tertiary",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function FeedbackCard({
  item,
  isSelected,
  onSelect,
}: {
  item: FeedbackItem;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full rounded-xl p-4 text-left transition-colors ${
        isSelected
          ? "bg-primary-container/10 ring-1 ring-primary/30"
          : "bg-surface-container hover:bg-surface-container-high"
      }`}
    >
      <div className="mb-2 flex items-center gap-2">
        <span
          className={`inline-block rounded-full px-2 py-0.5 font-label text-[10px] uppercase tracking-wider ${categoryStyle[item.category] ?? ""}`}
        >
          {item.category}
        </span>
        <span className="font-label text-[10px] text-on-surface-variant">
          {timeAgo(item.createdAt)}
        </span>
        <span className="ml-auto font-label text-[10px] text-on-surface-variant">
          {item.userName}
        </span>
      </div>
      <p className="line-clamp-2 text-sm text-on-surface">{item.description}</p>
      <p className="mt-1 truncate font-label text-[10px] text-on-surface-variant">
        {item.routeName || item.pageUrl}
      </p>
    </button>
  );
}

function FeedbackDetailPanel({ id }: { id: string }) {
  const { data, isLoading } = useFeedbackDetail(id);

  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <p className="text-sm text-on-surface-variant">Loading...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-48 items-center justify-center">
        <p className="text-sm text-on-surface-variant">
          Could not load feedback.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <div className="mb-2 flex items-center gap-2">
          <span
            className={`inline-block rounded-full px-2 py-0.5 font-label text-[10px] uppercase tracking-wider ${categoryStyle[data.category] ?? ""}`}
          >
            {data.category}
          </span>
          <span className="font-label text-xs text-on-surface-variant">
            {new Date(data.createdAt).toLocaleString()}
          </span>
        </div>
        <p className="text-sm text-on-surface">{data.description}</p>
      </div>

      {/* Metadata */}
      <div className="grid grid-cols-2 gap-3 rounded-lg bg-surface-container-low p-3">
        <div>
          <p className="font-label text-[10px] uppercase tracking-wider text-on-surface-variant">
            User
          </p>
          <p className="mt-0.5 text-sm text-on-surface">{data.userName}</p>
        </div>
        <div>
          <p className="font-label text-[10px] uppercase tracking-wider text-on-surface-variant">
            Browser
          </p>
          <p className="mt-0.5 text-sm text-on-surface">
            {data.browser || "--"}
          </p>
        </div>
        <div className="col-span-2">
          <p className="font-label text-[10px] uppercase tracking-wider text-on-surface-variant">
            Page
          </p>
          <p className="mt-0.5 truncate text-sm text-on-surface">
            {data.routeName || data.pageUrl}
          </p>
        </div>
        {data.sessionSummary && (
          <div className="col-span-2">
            <p className="font-label text-[10px] uppercase tracking-wider text-on-surface-variant">
              Session
            </p>
            <p className="mt-0.5 text-sm text-on-surface">
              {data.sessionSummary}
            </p>
          </div>
        )}
      </div>

      {/* Screenshot */}
      {data.screenshotUrl && (
        <div>
          <p className="mb-2 font-label text-[10px] uppercase tracking-wider text-on-surface-variant">
            Screenshot
          </p>
          <img
            src={data.screenshotUrl}
            alt="Feedback screenshot"
            className="max-h-64 rounded-lg border border-surface-container-highest object-contain"
          />
        </div>
      )}

      {/* Breadcrumbs */}
      {data.breadcrumbs && data.breadcrumbs.length > 0 && (
        <div>
          <p className="mb-3 font-label text-[10px] uppercase tracking-wider text-on-surface-variant">
            User Journey
          </p>
          <BreadcrumbTimeline breadcrumbs={data.breadcrumbs} />
        </div>
      )}
    </div>
  );
}

export function Feedback() {
  const [filter, setFilter] = useState<CategoryFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: items, isLoading } = useFeedbackList();

  const filtered =
    items?.filter((fb) => filter === "all" || fb.category === filter) ?? [];

  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <p className="text-sm text-on-surface-variant">Loading feedback...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="font-headline text-lg font-bold text-on-surface">
        Feedback
      </h2>

      {/* Filter tabs */}
      <div className="flex gap-1 rounded-lg bg-surface-container-low p-1">
        {filterTabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => {
              setFilter(tab.value);
              setSelectedId(null);
            }}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === tab.value
                ? "bg-primary-container text-on-primary-container"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            {tab.label}
            {items && tab.value !== "all" && (
              <span className="ml-1 opacity-60">
                ({items.filter((fb) => fb.category === tab.value).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content: list + detail */}
      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        {/* List */}
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <div className="flex h-32 items-center justify-center rounded-xl bg-surface-container">
              <p className="text-sm text-on-surface-variant">
                No {filter === "all" ? "" : filter} feedback found.
              </p>
            </div>
          ) : (
            filtered.map((fb) => (
              <FeedbackCard
                key={fb.id}
                item={fb}
                isSelected={selectedId === fb.id}
                onSelect={() =>
                  setSelectedId(selectedId === fb.id ? null : fb.id)
                }
              />
            ))
          )}
        </div>

        {/* Detail panel */}
        <div className="hidden lg:block">
          {selectedId ? (
            <div className="rounded-xl bg-surface-container p-5">
              <FeedbackDetailPanel id={selectedId} />
            </div>
          ) : (
            <div className="flex h-48 items-center justify-center rounded-xl bg-surface-container">
              <p className="text-sm text-on-surface-variant">
                Select a feedback item to see details
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Mobile detail (shown below list) */}
      {selectedId && (
        <div className="rounded-xl bg-surface-container p-5 lg:hidden">
          <FeedbackDetailPanel id={selectedId} />
        </div>
      )}
    </div>
  );
}
