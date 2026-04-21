export function Settings() {
  return (
    <div className="flex flex-col h-full">
      {/* Page Header */}
      <div className="px-7 pt-5 pb-4 border-b border-outline-variant/40 bg-surface-container-lowest header-gradient shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-1 h-8 bg-primary rounded-sm shrink-0" />
          <div>
            <h1 className="font-headline text-[22px] font-extrabold tracking-tight text-on-surface uppercase leading-tight">
              Settings
            </h1>
            <p className="text-[11px] font-medium text-outline tracking-[0.08em] uppercase mt-0.5">
              System Configuration // Preferences
            </p>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-7 pt-5 pb-6">
        <div className="bg-surface-container-lowest border border-outline-variant/40 rounded-[12px] p-12 flex flex-col items-center justify-center text-center space-y-4 card-rest">
          <span className="material-symbols-outlined text-5xl text-on-surface-variant">
            settings
          </span>
          <h2 className="text-lg font-bold font-headline text-on-surface/60">
            Coming Soon
          </h2>
          <p className="text-sm text-on-surface-variant font-body max-w-md">
            System preferences, notification settings, integration
            configuration, and theme options will be available here.
          </p>
        </div>
      </div>
    </div>
  );
}
