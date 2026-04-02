export function Settings() {
  return (
    <div className="p-8 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-black font-headline tracking-tight text-on-surface">
          Settings
        </h1>
        <p className="text-on-surface-variant font-label text-sm mt-1">
          SYSTEM CONFIGURATION // PREFERENCES
        </p>
      </div>
      <div className="bg-surface-container-low rounded-xl p-12 border border-on-surface/5 flex flex-col items-center justify-center text-center space-y-4">
        <span className="material-symbols-outlined text-5xl text-on-surface/20">
          settings
        </span>
        <h2 className="text-lg font-bold font-headline text-on-surface/60">
          Coming Soon
        </h2>
        <p className="text-sm text-on-surface/40 font-body max-w-md">
          System preferences, notification settings, integration configuration,
          and theme options will be available here.
        </p>
      </div>
    </div>
  );
}
