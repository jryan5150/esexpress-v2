import { Button } from "./Button";

interface ActionBarAction {
  label: string;
  icon?: string;
  variant?: "primary" | "secondary" | "ghost";
  onClick: () => void;
}

interface ActionBarProps {
  selectedCount: number;
  actions: ActionBarAction[];
  onClear: () => void;
}

export function ActionBar({ selectedCount, actions, onClear }: ActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="sticky top-16 z-30 flex items-center gap-3 px-5 py-3 bg-surface-container-high/95 backdrop-blur-sm border border-on-surface/10 rounded-xl mb-4 shadow-xl shadow-black/20">
      <span className="font-label text-sm font-bold text-primary-container">
        {selectedCount} selected
      </span>
      <div className="h-4 w-px bg-on-surface/10" />
      {actions.map((action) => (
        <Button
          key={action.label}
          variant={action.variant || "primary"}
          icon={action.icon}
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      ))}
      <button
        onClick={onClear}
        className="ml-auto text-on-surface/40 hover:text-on-surface text-xs font-headline font-bold uppercase tracking-wider transition-colors"
      >
        Clear
      </button>
    </div>
  );
}
