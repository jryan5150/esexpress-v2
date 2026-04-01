import { Button } from "@/components/Button";

/* -------------------------------------------------------------------------- */
/*  UsersAdmin — operator/user management with presence colors                */
/* -------------------------------------------------------------------------- */

type UserRole = "admin" | "dispatcher" | "driver" | "viewer";

interface MockUser {
  id: string;
  name: string;
  initials: string;
  email: string;
  role: UserRole;
  active: boolean;
  staffId: string;
  presenceColor: string;
  presenceLabel: string;
}

const ROLE_STYLE: Record<
  UserRole,
  { border: string; text: string; bg: string }
> = {
  admin: {
    border: "border-[var(--accent)]",
    text: "text-[var(--accent)]",
    bg: "bg-[var(--accent-dim)]",
  },
  dispatcher: {
    border: "border-[var(--status-info)]",
    text: "text-[var(--status-info)]",
    bg: "bg-[var(--status-info-dim)]",
  },
  driver: {
    border: "border-[var(--status-ready)]",
    text: "text-[var(--status-ready)]",
    bg: "bg-[var(--status-ready-dim)]",
  },
  viewer: {
    border: "border-[var(--text-tertiary)]",
    text: "text-[var(--text-tertiary)]",
    bg: "bg-[var(--bg-overlay)]",
  },
};

export function UsersAdmin() {
  return (
    <div className="p-6 pb-12 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-[var(--text-2xl)] font-extrabold tracking-tight text-[var(--text-primary)]">
            User Management
          </h1>
          <p className="text-[var(--text-secondary)] text-sm mt-1">
            Control platform access and operator presence assignments.
          </p>
        </div>
        <Button variant="primary" className="px-6 py-3 font-bold">
          + Invite New User
        </Button>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          label="Total Operators"
          value="24"
          borderColor="border-[var(--accent)]"
        />
        <StatCard
          label="Active Now"
          value="18"
          borderColor="border-[var(--status-ready)]"
        />
        <StatCard
          label="Pending Invites"
          value="03"
          borderColor="border-[var(--status-info)]"
        />
        <StatCard
          label="System Capacity"
          value="92%"
          borderColor="border-[var(--text-tertiary)]"
        />
      </div>

      {/* User Table */}
      <div className="bg-[var(--bg-surface)] rounded-[var(--radius-lg)] overflow-hidden shadow-[var(--shadow-lg)]">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[var(--bg-elevated)] border-b border-[var(--border-subtle)]">
              {["Operator", "Email Address", "Role", "Status", "Actions"].map(
                (h) => (
                  <th
                    key={h}
                    className={`px-6 py-4 font-bold text-[11px] uppercase tracking-widest text-[var(--text-tertiary)] ${
                      h === "Actions" ? "text-right" : ""
                    }`}
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {MOCK_USERS.map((user) => {
              const roleStyle = ROLE_STYLE[user.role];
              return (
                <tr
                  key={user.id}
                  className="hover:bg-[var(--bg-elevated)] transition-colors group"
                >
                  {/* Name + Presence */}
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        <div className="w-10 h-10 rounded-full bg-[var(--bg-overlay)] flex items-center justify-center text-sm font-bold text-[var(--text-primary)]">
                          {user.initials}
                        </div>
                        <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-[var(--bg-overlay)] flex items-center justify-center">
                          <div
                            className={`w-2 h-2 rounded-full ${
                              user.active
                                ? "bg-[var(--status-ready)]"
                                : "bg-[var(--text-tertiary)]"
                            }`}
                          />
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[var(--text-primary)]">
                            {user.name}
                          </span>
                          <div
                            className="w-3 h-3 rounded-full cursor-pointer hover:ring-2 ring-white/20"
                            style={{ background: user.presenceColor }}
                            title={`Presence: ${user.presenceLabel}`}
                          />
                        </div>
                        <span className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-tight font-[var(--font-mono)]">
                          Staff ID: {user.staffId}
                        </span>
                      </div>
                    </div>
                  </td>

                  {/* Email */}
                  <td className="px-6 py-4">
                    <span className="font-[var(--font-mono)] text-xs text-[var(--text-secondary)] bg-[var(--bg-overlay)] px-2 py-1 rounded">
                      {user.email}
                    </span>
                  </td>

                  {/* Role Badge */}
                  <td className="px-6 py-4">
                    <span
                      className={`font-[var(--font-mono)] text-[10px] px-2 py-0.5 rounded border uppercase ${roleStyle.border} ${roleStyle.text} ${roleStyle.bg}`}
                    >
                      {user.role}
                    </span>
                  </td>

                  {/* Status Toggle */}
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-8 h-4 rounded-full relative cursor-pointer ${
                          user.active
                            ? "bg-[var(--status-ready-dim)]"
                            : "bg-[var(--bg-overlay)]"
                        }`}
                      >
                        <div
                          className={`absolute top-0.5 w-3 h-3 rounded-full transition-all ${
                            user.active
                              ? "right-0.5 bg-[var(--status-ready)]"
                              : "left-0.5 bg-[var(--text-tertiary)]"
                          }`}
                        />
                      </div>
                      <span
                        className={`text-[11px] font-bold uppercase ${
                          user.active
                            ? "text-[var(--status-ready)]"
                            : "text-[var(--text-tertiary)]"
                        }`}
                      >
                        {user.active ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </td>

                  {/* Actions */}
                  <td className="px-6 py-4 text-right">
                    <button className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
                      &#x22EE;
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Footer */}
        <div className="bg-[var(--bg-elevated)] border-t border-[var(--border-subtle)] px-6 py-4 flex items-center justify-between">
          <p className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-widest">
            Showing {MOCK_USERS.length} of 24 operators
          </p>
          <div className="flex gap-2">
            <button className="w-8 h-8 rounded border border-[var(--border-default)] flex items-center justify-center text-[var(--text-tertiary)] hover:bg-[var(--bg-overlay)] transition-all">
              &larr;
            </button>
            <button className="w-8 h-8 rounded border border-[var(--accent-dim)] bg-[var(--accent-dim)] flex items-center justify-center text-[var(--accent)] text-xs font-bold font-[var(--font-mono)]">
              1
            </button>
            <button className="w-8 h-8 rounded border border-[var(--border-default)] flex items-center justify-center text-[var(--text-tertiary)] hover:bg-[var(--bg-overlay)] transition-all text-xs font-bold font-[var(--font-mono)]">
              2
            </button>
            <button className="w-8 h-8 rounded border border-[var(--border-default)] flex items-center justify-center text-[var(--text-tertiary)] hover:bg-[var(--bg-overlay)] transition-all">
              &rarr;
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Presence Legend */}
        <div className="bg-[var(--bg-surface)] p-6 rounded-[var(--radius-lg)] border border-[var(--border-subtle)]">
          <h3 className="font-bold text-xs uppercase tracking-widest text-[var(--text-tertiary)] mb-4">
            Operator Presence Markers
          </h3>
          <div className="grid grid-cols-3 gap-3">
            {PRESENCE_LEGEND.map((p) => (
              <div key={p.label} className="flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded"
                  style={{ background: p.color }}
                />
                <span className="font-[var(--font-mono)] text-[10px] text-[var(--text-secondary)]">
                  {p.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Security Card */}
        <div className="bg-[var(--bg-surface)] p-6 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] flex items-center gap-6">
          <div className="w-16 h-16 rounded-full bg-[var(--accent-dim)] border border-[var(--accent-dim)] flex items-center justify-center text-2xl text-[var(--accent)]">
            &#x1F6E1;
          </div>
          <div>
            <h3 className="font-bold text-xs uppercase tracking-widest text-[var(--text-tertiary)] mb-1">
              Access Security
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mb-3">
              All dashboard actions are logged. 2FA is mandatory for Admin
              roles.
            </p>
            <button className="text-[10px] font-bold uppercase tracking-widest text-[var(--accent)] hover:underline">
              View Security Logs
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Inline sub-components                                                     */
/* -------------------------------------------------------------------------- */

function StatCard({
  label,
  value,
  borderColor,
}: {
  label: string;
  value: string;
  borderColor: string;
}) {
  return (
    <div
      className={`bg-[var(--bg-surface)] p-5 rounded-[var(--radius-lg)] border-l-4 ${borderColor}`}
    >
      <p className="text-[10px] uppercase tracking-widest text-[var(--text-tertiary)] font-bold mb-1">
        {label}
      </p>
      <p className="text-2xl font-bold text-[var(--text-primary)]">{value}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Mock data                                                                 */
/* -------------------------------------------------------------------------- */

const PRESENCE_LEGEND = [
  { label: "North Hub", color: "#f0692c" },
  { label: "South Hub", color: "#3b82f6" },
  { label: "Pipeline A", color: "#10b981" },
  { label: "Terminal 4", color: "#fbbf24" },
  { label: "Logistics", color: "#a855f7" },
  { label: "External", color: "#f43f5e" },
];

const MOCK_USERS: MockUser[] = [
  {
    id: "jessica-01",
    name: "Jessica Harper",
    initials: "JH",
    email: "j.harper@esexpress.logistics",
    role: "admin",
    active: true,
    staffId: "04-9921",
    presenceColor: "#f0692c",
    presenceLabel: "North Hub",
  },
  {
    id: "scout-01",
    name: "Scout Daniels",
    initials: "SD",
    email: "s.daniels@esexpress.logistics",
    role: "dispatcher",
    active: true,
    staffId: "04-1052",
    presenceColor: "#3b82f6",
    presenceLabel: "South Hub",
  },
  {
    id: "stephanie-01",
    name: "Stephanie Voss",
    initials: "SV",
    email: "s.voss@esexpress.logistics",
    role: "dispatcher",
    active: true,
    staffId: "04-8843",
    presenceColor: "#10b981",
    presenceLabel: "Pipeline A",
  },
  {
    id: "katie-01",
    name: "Katie Brennan",
    initials: "KB",
    email: "k.brennan@esexpress.logistics",
    role: "driver",
    active: false,
    staffId: "04-2201",
    presenceColor: "#fbbf24",
    presenceLabel: "Terminal 4",
  },
  {
    id: "jenny-01",
    name: "Jenny Liu",
    initials: "JL",
    email: "j.liu@esexpress.logistics",
    role: "viewer",
    active: true,
    staffId: "04-3390",
    presenceColor: "#a855f7",
    presenceLabel: "Logistics",
  },
];
