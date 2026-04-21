import { Link, useParams } from "react-router-dom";
import { useArchiveLoad } from "../hooks/use-archive";

export function ArchiveLoadDetail() {
  const { id } = useParams<{ id: string }>();
  const loadId = Number(id ?? 0);
  const query = useArchiveLoad(loadId);

  const load = query.data;

  if (query.isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!load) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8">
        <span className="material-symbols-outlined text-4xl text-on-surface-variant">
          search_off
        </span>
        <p className="text-on-surface font-headline text-lg">Load not found</p>
        <p className="text-on-surface-variant text-sm">
          This archived load may not exist or is unavailable.
        </p>
        <Link
          to="/archive"
          className="mt-2 text-sm text-primary hover:underline flex items-center gap-1"
        >
          <span className="material-symbols-outlined text-base">
            arrow_back
          </span>
          Back to Archive
        </Link>
      </div>
    );
  }

  const fields = [
    { label: "Load #", value: load.loadNo },
    { label: "Driver", value: load.driverName },
    { label: "Truck", value: load.truckNo },
    { label: "Carrier", value: load.carrierName },
    { label: "Well", value: load.wellName },
    { label: "Product", value: load.productDescription },
    {
      label: "Weight",
      value: load.weightTons ? `${load.weightTons} tons` : null,
    },
    { label: "BOL", value: load.bolNo },
    { label: "Ticket", value: load.ticketNo },
    {
      label: "Delivered",
      value: load.deliveredOn
        ? new Date(load.deliveredOn).toLocaleDateString()
        : null,
    },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-auto bg-surface-container-lowest">
      {/* Breadcrumb */}
      <div className="px-6 py-4 border-b border-outline-variant/30 flex items-center gap-2 text-sm">
        <Link
          to="/archive"
          className="text-on-surface-variant hover:text-on-surface transition-colors"
        >
          Archive
        </Link>
        <span className="text-on-surface-variant">/</span>
        <span className="text-on-surface font-medium">Load #{load.loadNo}</span>
      </div>

      <div className="px-6 py-5 max-w-3xl w-full">
        {/* Archive badge */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-yellow-100 border border-yellow-300 text-yellow-800 text-xs font-semibold mb-5">
          <span className="material-symbols-outlined text-sm">inventory_2</span>
          Archived — pre-2026 load
        </div>

        <h1 className="font-headline font-bold text-2xl text-on-surface mb-6">
          Load #{load.loadNo}
        </h1>

        {/* Fields grid */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-5">
          {fields.map(({ label, value }) => (
            <div key={label}>
              <dt className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1">
                {label}
              </dt>
              <dd className="text-sm text-on-surface font-label">
                {value ?? <span className="text-on-surface-variant">—</span>}
              </dd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
