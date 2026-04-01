import { useState } from "react";
import { Button } from "@/components/Button";

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
    <div className="p-6 pb-12 max-w-7xl mx-auto space-y-6 relative">
      {/* Header */}
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-[var(--text-2xl)] font-bold tracking-tight text-[var(--text-primary)]">
            Companies Management
          </h1>
          <p className="text-[var(--text-secondary)] mt-1">
            Manage carrier partnerships and operator registry
          </p>
        </div>
        <Button variant="primary" className="px-6 py-2.5 font-bold">
          + Add Company
        </Button>
      </div>

      {/* Filters */}
      <div className="bg-[var(--bg-surface)] p-4 flex gap-4 items-center rounded-t-[var(--radius-md)]">
        <div className="flex-1 relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] text-sm">
            &#x1F50D;
          </span>
          <input
            className="w-full bg-[var(--bg-overlay)] border-none rounded-[var(--radius-sm)] pl-10 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:ring-1 focus:ring-[var(--accent)]"
            placeholder="Search by name, contact, or location..."
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button
          variant="ghost"
          className="text-[var(--text-xs)] uppercase tracking-widest font-bold"
        >
          Filter
        </Button>
        <Button
          variant="ghost"
          className="text-[var(--text-xs)] uppercase tracking-widest font-bold"
        >
          Export
        </Button>
      </div>

      {/* Table */}
      <div className="bg-[var(--bg-surface)] overflow-hidden rounded-b-[var(--radius-md)]">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[var(--bg-elevated)] text-[var(--text-tertiary)] text-[10px] uppercase tracking-[0.2em] font-bold">
              <th className="px-6 py-4 border-b border-[var(--border-subtle)]">
                Company Name
              </th>
              <th className="px-6 py-4 border-b border-[var(--border-subtle)]">
                Type
              </th>
              <th className="px-6 py-4 border-b border-[var(--border-subtle)]">
                Primary Contact
              </th>
              <th className="px-6 py-4 border-b border-[var(--border-subtle)]">
                Phone
              </th>
              <th className="px-6 py-4 border-b border-[var(--border-subtle)]">
                Status
              </th>
              <th className="px-6 py-4 border-b border-[var(--border-subtle)] text-right">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {filtered.map((company) => {
              const isFocused = selectedId === company.id;
              const typeColor =
                company.type === "operator"
                  ? "text-[var(--accent)]"
                  : "text-[var(--status-info)]";
              const typeDot =
                company.type === "operator"
                  ? "bg-[var(--accent)]"
                  : "bg-[var(--status-info)]";

              return (
                <tr
                  key={company.id}
                  className={`group transition-colors cursor-pointer ${
                    isFocused
                      ? "border-l-4 border-[var(--accent)] bg-[var(--bg-elevated)]"
                      : "border-l-4 border-transparent hover:bg-[var(--bg-elevated)]"
                  }`}
                  onClick={() => setSelectedId(company.id)}
                >
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-[var(--radius-sm)] bg-[var(--bg-overlay)] flex items-center justify-center text-sm font-bold text-[var(--text-secondary)]">
                        {company.name
                          .split(" ")
                          .map((w) => w[0])
                          .slice(0, 2)
                          .join("")}
                      </div>
                      <div>
                        <p className="font-bold text-[var(--text-primary)]">
                          {company.name}
                        </p>
                        <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider font-[var(--font-mono)]">
                          ID: {company.id.toUpperCase()}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <span
                      className={`bg-[var(--bg-overlay)] px-3 py-1 rounded-full text-[10px] font-bold tracking-tight flex items-center w-fit gap-1.5 ${typeColor}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${typeDot}`} />
                      {company.type.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-5 text-sm text-[var(--text-primary)] font-medium">
                    {company.contact}
                  </td>
                  <td className="px-6 py-5 text-sm font-[var(--font-mono)] text-[var(--text-secondary)]">
                    {company.phone}
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-8 h-4 rounded-full relative ${
                          company.active
                            ? "bg-[var(--status-ready-dim)]"
                            : "bg-[var(--bg-overlay)]"
                        }`}
                      >
                        <div
                          className={`absolute top-0.5 w-3 h-3 rounded-full transition-all ${
                            company.active
                              ? "right-0.5 bg-[var(--status-ready)]"
                              : "left-0.5 bg-[var(--text-tertiary)]"
                          }`}
                        />
                      </div>
                      <span
                        className={`text-[10px] font-bold uppercase ${
                          company.active
                            ? "text-[var(--status-ready)]"
                            : "text-[var(--text-tertiary)]"
                        }`}
                      >
                        {company.active ? "ACTIVE" : "INACTIVE"}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-5 text-right">
                    <button className="text-[var(--text-tertiary)] hover:text-[var(--accent)] transition-colors">
                      &#x22EE;
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex justify-between items-center text-[10px] uppercase tracking-widest text-[var(--text-tertiary)] px-2">
        <p>
          Showing 1-{filtered.length} of {MOCK_COMPANIES.length} Companies
        </p>
        <div className="flex gap-2">
          <button className="bg-[var(--bg-surface)] px-3 py-1 hover:text-[var(--accent)] transition-colors border border-[var(--border-subtle)]">
            Prev
          </button>
          <button className="bg-[var(--bg-elevated)] text-[var(--accent)] px-3 py-1 border border-[var(--accent-dim)]">
            1
          </button>
          <button className="bg-[var(--bg-surface)] px-3 py-1 hover:text-[var(--accent)] transition-colors border border-[var(--border-subtle)]">
            Next
          </button>
        </div>
      </div>

      {/* Detail Drawer */}
      {selected && (
        <aside className="fixed inset-y-0 right-0 w-[420px] bg-[var(--bg-surface)] shadow-2xl border-l border-[var(--border-subtle)] z-50 flex flex-col">
          {/* Drawer Header */}
          <div className="p-8 border-b border-[var(--border-subtle)]">
            <div className="flex justify-between items-start mb-6">
              <div className="w-16 h-16 rounded-[var(--radius-sm)] bg-[var(--bg-overlay)] flex items-center justify-center text-2xl font-bold text-[var(--accent)]">
                {selected.name
                  .split(" ")
                  .map((w) => w[0])
                  .slice(0, 2)
                  .join("")}
              </div>
              <button
                className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                onClick={() => setSelectedId(null)}
              >
                &times;
              </button>
            </div>
            <h3 className="text-2xl font-bold text-[var(--text-primary)]">
              {selected.name}
            </h3>
            <div className="flex gap-2 mt-2">
              <span className="bg-[var(--accent-dim)] text-[var(--accent)] text-[10px] font-bold px-2 py-0.5 rounded-[var(--radius-sm)]">
                {selected.type.toUpperCase()}
              </span>
              {selected.active && (
                <span className="bg-[var(--status-ready-dim)] text-[var(--status-ready)] text-[10px] font-bold px-2 py-0.5 rounded-[var(--radius-sm)]">
                  VERIFIED
                </span>
              )}
            </div>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-auto p-8 space-y-10">
            {/* Addresses */}
            <section>
              <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-4">
                Location &amp; Address
              </h4>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-[10px] font-bold text-[var(--text-tertiary)] uppercase mb-1">
                    HQ Address
                  </label>
                  <p className="text-sm leading-relaxed text-[var(--text-primary)]">
                    {selected.hqAddress}
                  </p>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-[var(--text-tertiary)] uppercase mb-1">
                    Billing Address
                  </label>
                  <p className="text-sm leading-relaxed text-[var(--text-primary)]">
                    {selected.billingAddress}
                  </p>
                </div>
              </div>
            </section>

            {/* Secondary Contacts */}
            <section>
              <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-4">
                Secondary Contacts
              </h4>
              <div className="space-y-3">
                {selected.secondaryContacts.map((c) => (
                  <div
                    key={c.initials}
                    className="bg-[var(--bg-base)] p-4 rounded-[var(--radius-sm)] flex items-center justify-between group hover:bg-[var(--bg-elevated)] transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[var(--bg-overlay)] flex items-center justify-center text-xs font-bold text-[var(--text-primary)]">
                        {c.initials}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-[var(--text-primary)]">
                          {c.name}
                        </p>
                        <p className="text-xs text-[var(--text-tertiary)]">
                          {c.title}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Recent Activity */}
            <section>
              <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-4">
                Recent Network Activity
              </h4>
              <div className="relative pl-6 space-y-6 before:content-[''] before:absolute before:left-2 before:top-2 before:bottom-2 before:w-[1px] before:bg-[var(--border-subtle)]">
                {selected.recentActivity.map((a, i) => (
                  <div key={i} className="relative">
                    <div
                      className={`absolute -left-[1.65rem] top-1 w-2.5 h-2.5 rounded-full border-4 border-[var(--bg-surface)] ${
                        i === 0
                          ? "bg-[var(--accent)]"
                          : "bg-[var(--text-tertiary)]"
                      }`}
                    />
                    <p className="text-xs font-bold text-[var(--text-primary)]">
                      {a.text}
                    </p>
                    <p className="text-[10px] font-[var(--font-mono)] text-[var(--text-tertiary)]">
                      {a.date}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Drawer Footer */}
          <div className="p-6 bg-[var(--bg-base)] flex gap-3 border-t border-[var(--border-subtle)]">
            <Button
              variant="secondary"
              className="flex-1 py-3 font-bold text-sm uppercase tracking-widest"
            >
              Edit Details
            </Button>
            <Button
              variant="primary"
              className="flex-1 py-3 font-bold text-sm uppercase tracking-widest"
            >
              Assign Load
            </Button>
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
