interface Props {
  customers: Array<{ id: number; name: string }>;
  highlight: number | "all" | "mine_only";
  onHighlight: (next: number | "all" | "mine_only") => void;
  myCustomerId: number | null;
}

export function UserHighlightStrip({
  customers,
  highlight,
  onHighlight,
  myCustomerId,
}: Props) {
  const pillClass = (active: boolean) =>
    `px-3 py-1 text-xs rounded-full border transition-colors ${
      active
        ? "bg-accent text-white border-accent"
        : "bg-bg-primary border-border text-text-secondary hover:bg-bg-tertiary"
    }`;
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {myCustomerId != null && (
        <button
          type="button"
          onClick={() => onHighlight("mine_only")}
          className={pillClass(highlight === "mine_only")}
        >
          Mine Only
        </button>
      )}
      <button
        type="button"
        onClick={() => onHighlight("all")}
        className={pillClass(highlight === "all")}
      >
        All
      </button>
      {customers.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onHighlight(c.id)}
          className={pillClass(highlight === c.id)}
        >
          {c.name}
        </button>
      ))}
    </div>
  );
}
