import { useState } from "react";

/* -------------------------------------------------------------------------- */
/*  CompaniesAdmin — carrier/operator registry CRUD                           */
/* -------------------------------------------------------------------------- */

type CompanyType = "operator" | "carrier";

interface Contact {
  initials: string;
  name: string;
  title: string;
}

interface MockCompany {
  id: string;
  name: string;
  type: CompanyType;
  contact: string;
  phone: string;
  active: boolean;
  hqAddress: string;
  billingAddress: string;
  secondaryContacts: Contact[];
  recentActivity: { text: string; date: string }[];
}

export function CompaniesAdmin() {
  const [selectedId, setSelectedId] = useState<string | null>("hal-tx-9021");
  const [search, setSearch] = useState("");

  const selected = MOCK_COMPANIES.find((c) => c.id === selectedId) ?? null;

  const filtered = MOCK_COMPANIES.filter(
    (c) =>
      search === "" ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.contact.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="p-8 pb-12 max-w-7xl mx-auto relative">
      {/* Header */}
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[var(--es-text-primary)]">
            Companies Management
          </h1>
          <p className="text-[var(--es-text-secondary)] mt-1">
            Manage carrier partnerships and operator registry
          </p>
        </div>
        <button className="bg-[var(--es-accent)] text-white px-6 py-2.5 rounded-sm font-bold text-sm flex items-center gap-2 shadow-lg shadow-[var(--es-accent)]/20 hover:scale-[1.02] active:scale-95 transition-all">
          <span className="material-symbols-outlined text-lg">domain_add</span>
          Add Company
        </button>
      </div>

      {/* Filters */}
      <div className="bg-[#161b28] p-4 mb-px flex gap-4 items-center rounded-t-[var(--es-radius-md)]">
        <div className="flex-1 relative">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[var(--es-text-primary)]/30 text-lg">
            search
          </span>
          <input
            className="w-full bg-[var(--es-bg-overlay)]/50 border-none rounded-sm pl-10 text-sm text-[var(--es-text-primary)] placeholder:text-[var(--es-text-primary)]/20 focus:ring-1 focus:ring-[var(--es-accent)]/50"
            placeholder="Search by name, contact, or location..."
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <button className="bg-[var(--es-bg-elevated)] px-4 py-2 text-xs font-bold uppercase tracking-widest text-[var(--es-text-secondary)] hover:text-[var(--es-text-primary)] flex items-center gap-2 transition-colors">
            <span className="material-symbols-outlined text-sm">
              filter_alt
            </span>
            Filter
          </button>
          <button className="bg-[var(--es-bg-elevated)] px-4 py-2 text-xs font-bold uppercase tracking-widest text-[var(--es-text-secondary)] hover:text-[var(--es-text-primary)] flex items-center gap-2 transition-colors">
            <span className="material-symbols-outlined text-sm">download</span>
            Export
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#161b28] overflow-hidden rounded-b-[var(--es-radius-md)]">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[var(--es-bg-elevated)]/50 text-[var(--es-text-tertiary)] text-[10px] uppercase tracking-[0.2em] font-bold">
              <th className="px-6 py-4 border-b border-[var(--es-bg-base)]/50">
                Company Name
              </th>
              <th className="px-6 py-4 border-b border-[var(--es-bg-base)]/50">
                Type
              </th>
              <th className="px-6 py-4 border-b border-[var(--es-bg-base)]/50">
                Primary Contact
              </th>
              <th className="px-6 py-4 border-b border-[var(--es-bg-base)]/50">
                Phone
              </th>
              <th className="px-6 py-4 border-b border-[var(--es-bg-base)]/50">
                Status
              </th>
              <th className="px-6 py-4 border-b border-[var(--es-bg-base)]/50 text-right">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--es-bg-base)]/30">
            {filtered.map((company) => {
              const isFocused = selectedId === company.id;
              const typeColor =
                company.type === "operator"
                  ? "text-[#ffb599]"
                  : "text-[#bfc5e3]";
              const typeDot =
                company.type === "operator" ? "bg-[#ffb599]" : "bg-[#bfc5e3]";

              return (
                <tr
                  key={company.id}
                  className={`group transition-colors cursor-pointer ${
                    isFocused
                      ? "border-l-4 border-[var(--es-accent)] bg-[var(--es-bg-elevated)]/40"
                      : "border-l-4 border-transparent hover:bg-[var(--es-bg-elevated)]/40"
                  }`}
                  onClick={() => setSelectedId(company.id)}
                >
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-[var(--es-radius-sm)] bg-[var(--es-bg-overlay)] flex items-center justify-center">
                        <span
                          className={`material-symbols-outlined ${isFocused ? "text-[var(--es-accent)]" : "text-[var(--es-text-tertiary)]"}`}
                        >
                          {company.type === "operator"
                            ? "factory"
                            : "local_shipping"}
                        </span>
                      </div>
                      <div>
                        <p className="font-bold text-[var(--es-text-primary)]">
                          {company.name}
                        </p>
                        <p className="text-[10px] text-[var(--es-text-tertiary)] uppercase tracking-wider font-[var(--es-font-mono)]">
                          ID: {company.id.toUpperCase()}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <span
                      className={`bg-[var(--es-bg-overlay)] px-3 py-1 rounded-full text-[10px] font-bold tracking-tighter flex items-center w-fit gap-1.5 ${typeColor}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${typeDot}`} />
                      {company.type.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-5 text-sm text-[var(--es-text-primary)] font-medium">
                    {company.contact}
                  </td>
                  <td className="px-6 py-5 text-sm font-[var(--es-font-mono)] text-[var(--es-text-secondary)]">
                    {company.phone}
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-8 h-4 rounded-full relative ${
                          company.active
                            ? "bg-[var(--es-ready-dim)]"
                            : "bg-[var(--es-bg-overlay)]"
                        }`}
                      >
                        <div
                          className={`absolute top-0.5 w-3 h-3 rounded-full transition-all ${
                            company.active
                              ? "right-0.5 bg-[var(--es-ready)]"
                              : "left-0.5 bg-[var(--es-text-tertiary)]"
                          }`}
                        />
                      </div>
                      <span
                        className={`text-[10px] font-bold uppercase ${
                          company.active
                            ? "text-[var(--es-ready)]"
                            : "text-[var(--es-text-tertiary)]"
                        }`}
                      >
                        {company.active ? "ACTIVE" : "INACTIVE"}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-5 text-right">
                    <button className="text-[var(--es-text-tertiary)] hover:text-[var(--es-accent)] transition-colors">
                      <span className="material-symbols-outlined">
                        more_vert
                      </span>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex justify-between items-center text-[10px] font-[var(--es-font-mono)] uppercase tracking-widest text-[var(--es-text-tertiary)] px-2 mt-4">
        <p>Showing 1-10 of 42 Companies</p>
        <div className="flex gap-2">
          <button className="bg-[var(--es-bg-surface)] px-3 py-1 hover:text-[var(--es-accent)] transition-colors border border-[var(--es-bg-elevated)]">
            Prev
          </button>
          <button className="bg-[var(--es-bg-elevated)] text-[var(--es-accent)] px-3 py-1 border border-[var(--es-accent)]/20">
            1
          </button>
          <button className="bg-[var(--es-bg-surface)] px-3 py-1 hover:text-[var(--es-accent)] transition-colors border border-[var(--es-bg-elevated)]">
            2
          </button>
          <button className="bg-[var(--es-bg-surface)] px-3 py-1 hover:text-[var(--es-accent)] transition-colors border border-[var(--es-bg-elevated)]">
            3
          </button>
          <button className="bg-[var(--es-bg-surface)] px-3 py-1 hover:text-[var(--es-accent)] transition-colors border border-[var(--es-bg-elevated)]">
            Next
          </button>
        </div>
      </div>

      {/* Detail Drawer */}
      {selected && (
        <aside className="fixed inset-y-0 right-0 w-[450px] bg-[var(--es-bg-surface)] shadow-2xl border-l border-[var(--es-bg-overlay)] z-50 flex flex-col">
          {/* Drawer Header */}
          <div className="p-8 border-b border-[var(--es-bg-overlay)]">
            <div className="flex justify-between items-start mb-6">
              <div className="w-16 h-16 rounded-sm bg-[var(--es-bg-overlay)] flex items-center justify-center">
                <span className="material-symbols-outlined text-4xl text-[var(--es-accent)]">
                  {selected.type === "operator" ? "factory" : "local_shipping"}
                </span>
              </div>
              <button
                className="text-[var(--es-text-tertiary)] hover:text-[var(--es-text-primary)] transition-colors"
                onClick={() => setSelectedId(null)}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <h3 className="text-2xl font-bold text-[var(--es-text-primary)]">
              {selected.name}
            </h3>
            <div className="flex gap-2 mt-2">
              <span className="bg-[#ffb599]/10 text-[#ffb599] text-[10px] font-bold px-2 py-0.5 rounded-sm">
                {selected.type.toUpperCase()}
              </span>
              {selected.active && (
                <span className="bg-[var(--es-ready)]/10 text-[var(--es-ready)] text-[10px] font-bold px-2 py-0.5 rounded-sm">
                  VERIFIED
                </span>
              )}
            </div>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-auto p-8 space-y-10">
            {/* Addresses */}
            <section>
              <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--es-text-primary)]/30 mb-4">
                Location &amp; Address
              </h4>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-[10px] font-bold text-[var(--es-text-primary)]/40 uppercase mb-1">
                    HQ Address
                  </label>
                  <p className="text-sm leading-relaxed text-[var(--es-text-primary)]">
                    {selected.hqAddress}
                  </p>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-[var(--es-text-primary)]/40 uppercase mb-1">
                    Billing Address
                  </label>
                  <p className="text-sm leading-relaxed text-[var(--es-text-primary)]">
                    {selected.billingAddress}
                  </p>
                </div>
              </div>
            </section>

            {/* Secondary Contacts */}
            <section>
              <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--es-text-primary)]/30 mb-4">
                Secondary Contacts
              </h4>
              <div className="space-y-3">
                {selected.secondaryContacts.map((c) => (
                  <div
                    key={c.initials}
                    className="bg-[#161b28] p-4 rounded-sm flex items-center justify-between group hover:bg-[var(--es-bg-elevated)] transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[var(--es-bg-overlay)] flex items-center justify-center text-xs font-bold text-[var(--es-text-primary)]">
                        {c.initials}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-[var(--es-text-primary)]">
                          {c.name}
                        </p>
                        <p className="text-xs text-[var(--es-text-tertiary)]">
                          {c.title}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="p-2 bg-[var(--es-bg-overlay)] hover:text-[var(--es-accent)] transition-colors rounded-sm">
                        <span className="material-symbols-outlined text-sm">
                          mail
                        </span>
                      </button>
                      <button className="p-2 bg-[var(--es-bg-overlay)] hover:text-[var(--es-accent)] transition-colors rounded-sm">
                        <span className="material-symbols-outlined text-sm">
                          call
                        </span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Recent Activity */}
            <section>
              <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--es-text-primary)]/30 mb-4">
                Recent Network Activity
              </h4>
              <div className="relative pl-6 space-y-6 before:content-[''] before:absolute before:left-2 before:top-2 before:bottom-2 before:w-[1px] before:bg-[var(--es-bg-overlay)]">
                {selected.recentActivity.map((a, i) => (
                  <div key={i} className="relative">
                    <div
                      className={`absolute -left-[1.65rem] top-1 w-2.5 h-2.5 rounded-full border-4 border-[var(--es-bg-surface)] ${
                        i === 0
                          ? "bg-[#ffb599]"
                          : "bg-[var(--es-text-primary)]/20"
                      }`}
                    />
                    <p className="text-xs font-bold text-[var(--es-text-primary)]">
                      {a.text}
                    </p>
                    <p className="text-[10px] font-[var(--es-font-mono)] text-[var(--es-text-primary)]/30">
                      {a.date.replace(" - ", " \u00B7 ")}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Drawer Footer */}
          <div className="p-6 bg-[#161b28] flex gap-3">
            <button className="flex-1 bg-[var(--es-bg-overlay)] text-[var(--es-text-primary)] py-3 rounded-sm font-bold text-sm uppercase tracking-widest hover:brightness-125 transition-all">
              Edit Details
            </button>
            <button className="flex-1 bg-[var(--es-accent)] text-white py-3 rounded-sm font-bold text-sm uppercase tracking-widest hover:brightness-110 shadow-lg shadow-[var(--es-accent)]/20 transition-all">
              Assign Load
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Mock data                                                                 */
/* -------------------------------------------------------------------------- */

const MOCK_COMPANIES: MockCompany[] = [
  {
    id: "hal-tx-9021",
    name: "Halliburton",
    type: "operator",
    contact: "Robert J. McAllister",
    phone: "+1 (281) 575-3000",
    active: true,
    hqAddress: "3000 N. Sam Houston Pkwy E.\nHouston, TX 77032",
    billingAddress: "P.O. Box 42810\nHouston, TX 77242",
    secondaryContacts: [
      {
        initials: "DM",
        name: "David Miller",
        title: "Safety Compliance Officer",
      },
      { initials: "AW", name: "Angela Wong", title: "Logistics Coordinator" },
    ],
    recentActivity: [
      { text: "New MSW-4402 Load Approved", date: "Oct 24, 2023 - 02:14 PM" },
      {
        text: "Insurance Documentation Updated",
        date: "Oct 21, 2023 - 10:45 AM",
      },
    ],
  },
  {
    id: "plg-ok-4421",
    name: "Pioneer Logistics Group",
    type: "carrier",
    contact: "Sarah Jenkins",
    phone: "+1 (405) 221-8890",
    active: true,
    hqAddress: "1200 S. Meridian Ave\nOklahoma City, OK 73108",
    billingAddress: "Same as HQ",
    secondaryContacts: [],
    recentActivity: [
      { text: "Fleet insurance renewed", date: "Oct 20, 2023 - 09:30 AM" },
    ],
  },
  {
    id: "oxy-tx-1102",
    name: "Occidental Petroleum",
    type: "operator",
    contact: "Marcus Thorne",
    phone: "+1 (713) 215-7000",
    active: false,
    hqAddress: "5 Greenway Plaza\nHouston, TX 77046",
    billingAddress: "5 Greenway Plaza, Suite 110\nHouston, TX 77046",
    secondaryContacts: [],
    recentActivity: [],
  },
  {
    id: "bgh-nd-7712",
    name: "Black Gold Haulers",
    type: "carrier",
    contact: "Elena Rodriguez",
    phone: "+1 (701) 882-3441",
    active: true,
    hqAddress: "810 E. Main St\nWilliston, ND 58801",
    billingAddress: "P.O. Box 2204\nWilliston, ND 58802",
    secondaryContacts: [
      { initials: "ER", name: "Elena Rodriguez", title: "Operations Manager" },
    ],
    recentActivity: [
      {
        text: "New driver certification uploaded",
        date: "Oct 23, 2023 - 11:15 AM",
      },
    ],
  },
];
