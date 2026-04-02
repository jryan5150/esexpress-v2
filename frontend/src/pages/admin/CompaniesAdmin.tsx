export function CompaniesAdmin() {
  return (
    <div className="p-8 max-w-7xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-black font-headline tracking-tight text-on-surface uppercase">
          Companies Management
        </h1>
        <p className="text-on-surface/40 font-label text-xs uppercase tracking-widest mt-1">
          Administration // Carrier &amp; Client Registry
        </p>
      </div>

      {/* Coming Soon Card */}
      <div className="bg-surface-container-low rounded-xl border border-on-surface/5 overflow-hidden">
        <div className="p-12 flex flex-col items-center justify-center text-center space-y-6">
          <div className="bg-primary-container/10 p-5 rounded-2xl">
            <span className="material-symbols-outlined text-5xl text-primary-container/60">
              business
            </span>
          </div>

          <div className="space-y-2 max-w-lg">
            <h2 className="text-lg font-bold font-headline text-on-surface/70">
              Company Management Coming Soon
            </h2>
            <p className="text-sm text-on-surface/40 font-body leading-relaxed">
              Carriers are auto-tracked from load ingestion. When a load arrives
              from PropX or Logistiq, its carrier name is captured
              automatically. Dedicated company profiles, contact management, and
              rate configuration will be available here in a future release.
            </p>
          </div>

          {/* Placeholder Table Preview */}
          <div className="w-full max-w-xl mt-4">
            <div className="text-left text-[10px] uppercase tracking-widest font-bold text-on-surface/20 px-4 py-2">
              Preview -- Auto-Tracked Carriers
            </div>
            <div className="space-y-[1px] bg-on-surface/5 rounded-xl overflow-hidden border border-on-surface/5">
              {[
                { name: "Basin Trucking LLC", loads: 124, type: "Carrier" },
                { name: "Permian Express", loads: 87, type: "Carrier" },
                { name: "West Texas Sand Co", loads: 45, type: "Supplier" },
              ].map((company) => (
                <div
                  key={company.name}
                  className="bg-surface-container-low px-6 py-4 flex items-center gap-6"
                >
                  <div className="flex-1">
                    <span className="text-sm font-bold text-on-surface/40">
                      {company.name}
                    </span>
                  </div>
                  <span className="font-label text-xs text-on-surface/20">
                    {company.loads} loads
                  </span>
                  <span className="inline-block px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-on-surface/5 text-on-surface/30">
                    {company.type}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-on-surface/20 text-center mt-3 font-label">
              Sample data -- actual carriers populated from load sync
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
