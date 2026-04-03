interface SidebarProps {
  sections: string[];
  active: string;
  onSelect: (section: string) => void;
}

const iconMap: Record<string, string> = {
  Overview: "dashboard",
  Pipeline: "sync",
  Performance: "speed",
  Errors: "error",
  Feedback: "feedback",
};

export function Sidebar({ sections, active, onSelect }: SidebarProps) {
  return (
    <>
      {/* Desktop sidebar */}
      <nav className="hidden w-56 shrink-0 border-r border-surface-container-highest bg-surface-container-low md:block">
        <ul className="space-y-1 p-3">
          {sections.map((s) => {
            const isActive = s === active;
            return (
              <li key={s}>
                <button
                  onClick={() => onSelect(s)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                    isActive
                      ? "border-l-2 border-primary bg-primary-container/10 text-primary"
                      : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
                  }`}
                >
                  <span className="material-symbols-outlined text-[20px]">
                    {iconMap[s] ?? "circle"}
                  </span>
                  <span className="font-body font-medium">{s}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Mobile horizontal tabs */}
      <nav className="shrink-0 overflow-x-auto border-b border-surface-container-highest bg-surface-container-low md:hidden">
        <ul className="flex min-w-max px-2">
          {sections.map((s) => {
            const isActive = s === active;
            return (
              <li key={s}>
                <button
                  onClick={() => onSelect(s)}
                  className={`flex items-center gap-1.5 px-3 py-3 text-xs font-medium transition-colors ${
                    isActive
                      ? "border-b-2 border-primary text-primary"
                      : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {iconMap[s] ?? "circle"}
                  </span>
                  {s}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
