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
    border: "border-[var(--es-accent)]/30",
    text: "text-[var(--es-accent)]",
    bg: "bg-[var(--es-accent)]/5",
  },
  dispatcher: {
    border: "border-[#bfc5e3]/30",
    text: "text-[#bfc5e3]",
    bg: "bg-[#bfc5e3]/5",
  },
  driver: {
    border: "border-[var(--es-ready)]",
    text: "text-[var(--es-ready)]",
    bg: "bg-[var(--es-ready-dim)]",
  },
  viewer: {
    border: "border-[#e0c0b4]/30",
    text: "text-[#e0c0b4]",
    bg: "bg-[#e0c0b4]/5",
  },
};

export function UsersAdmin() {
  return (
    <div className="p-8 pb-12 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-end mb-10">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-[var(--es-text-primary)] mb-2">
            User Management
          </h1>
          <p className="text-[var(--es-text-tertiary)]/60 text-sm">
            Control platform access and operator presence assignments.
          </p>
        </div>
        <Button
          variant="primary"
          className="px-6 py-3 font-bold rounded-lg shadow-lg shadow-[var(--es-accent)]/20 hover:brightness-110 active:scale-95"
        >
          <span
            className="material-symbols-outlined text-lg"
            style={{ fontVariationSettings: "'wght' 700" }}
          >
            person_add
          </span>
          Invite New User
        </Button>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Total Operators"
          value="24"
          borderColor="border-[var(--es-accent)]"
        />
        <StatCard
          label="Active Now"
          value="18"
          borderColor="border-[var(--es-ready)]"
        />
        <StatCard
          label="Pending Invites"
          value="03"
          borderColor="border-[var(--es-info)]"
        />
        <StatCard
          label="System Capacity"
          value="92%"
          borderColor="border-[var(--es-text-tertiary)]"
        />
      </div>

      {/* User Table */}
      <div className="bg-[#161b28] rounded-xl overflow-hidden shadow-2xl shadow-black/20">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[var(--es-bg-surface)] border-b border-[var(--es-bg-elevated)]">
              {["Operator", "Email Address", "Role", "Status", "Actions"].map(
                (h) => (
                  <th
                    key={h}
                    className={`px-6 py-4 font-bold text-[11px] uppercase tracking-widest text-[var(--es-text-tertiary)]/70 ${
                      h === "Actions" ? "text-right" : ""
                    }`}
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--es-bg-overlay)]/30">
            {MOCK_USERS.map((user) => {
              const roleStyle = ROLE_STYLE[user.role];
              return (
                <tr
                  key={user.id}
                  className="hover:bg-[var(--es-bg-elevated)] transition-colors group"
                >
                  {/* Name + Presence */}
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-[var(--es-text-primary)] grayscale brightness-90 group-hover:grayscale-0 transition-all"
                          style={{ backgroundColor: `${user.presenceColor}22` }}
                        >
                          {user.initials}
                        </div>
                        <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-[var(--es-bg-overlay)] flex items-center justify-center">
                          <div
                            className={`w-2 h-2 rounded-full ${
                              user.active
                                ? "bg-[var(--es-ready)]"
                                : "bg-[var(--es-text-tertiary)]"
                            }`}
                          />
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[var(--es-text-primary)]">
                            {user.name}
                          </span>
                          <div
                            className="w-3 h-3 rounded-full cursor-pointer hover:ring-2 ring-white/20"
                            style={{ background: user.presenceColor }}
                            title={`Presence: ${user.presenceLabel}`}
                          />
                        </div>
                        <span className="text-[10px] text-[var(--es-text-tertiary)] uppercase tracking-tight font-[var(--es-font-mono)]">
                          Staff ID: {user.staffId}
                        </span>
                      </div>
                    </div>
                  </td>

                  {/* Email */}
                  <td className="px-6 py-4">
                    <span className="font-[var(--es-font-mono)] text-xs text-[#b1b7d4] bg-[var(--es-bg-overlay)]/50 px-2 py-1 rounded">
                      {user.email}
                    </span>
                  </td>

                  {/* Role Badge */}
                  <td className="px-6 py-4">
                    <span
                      className={`font-[var(--es-font-mono)] text-[10px] px-2 py-0.5 rounded border uppercase ${roleStyle.border} ${roleStyle.text} ${roleStyle.bg}`}
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
                            ? "bg-[var(--es-ready-dim)]"
                            : "bg-[var(--es-bg-overlay)]"
                        }`}
                      >
                        <div
                          className={`absolute top-0.5 w-3 h-3 rounded-full transition-all ${
                            user.active
                              ? "right-0.5 bg-[var(--es-ready)]"
                              : "left-0.5 bg-[var(--es-text-tertiary)]"
                          }`}
                        />
                      </div>
                      <span
                        className={`text-[11px] font-bold uppercase ${
                          user.active
                            ? "text-[var(--es-ready)]"
                            : "text-[var(--es-text-tertiary)]"
                        }`}
                      >
                        {user.active ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </td>

                  {/* Actions */}
                  <td className="px-6 py-4 text-right">
                    <button className="text-[var(--es-text-tertiary)]/40 hover:text-[var(--es-text-primary)] transition-colors">
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

        {/* Footer */}
        <div className="bg-[var(--es-bg-surface)] border-t border-[var(--es-bg-elevated)] px-6 py-4 flex items-center justify-between">
          <p className="text-[11px] text-[var(--es-text-tertiary)]/50 uppercase tracking-widest">
            Showing {MOCK_USERS.length} of 24 operators
          </p>
          <div className="flex gap-2">
            <button className="w-8 h-8 rounded border border-[var(--es-border-default)]/30 flex items-center justify-center text-[var(--es-text-tertiary)] hover:bg-[var(--es-bg-overlay)] transition-all">
              <span className="material-symbols-outlined text-sm">
                chevron_left
              </span>
            </button>
            <button className="w-8 h-8 rounded border border-[var(--es-accent)]/50 bg-[var(--es-accent)]/10 flex items-center justify-center text-[var(--es-accent)] text-xs font-bold font-[var(--es-font-mono)]">
              1
            </button>
            <button className="w-8 h-8 rounded border border-[var(--es-border-default)]/30 flex items-center justify-center text-[var(--es-text-tertiary)] hover:bg-[var(--es-bg-overlay)] transition-all text-xs font-bold font-[var(--es-font-mono)]">
              2
            </button>
            <button className="w-8 h-8 rounded border border-[var(--es-border-default)]/30 flex items-center justify-center text-[var(--es-text-tertiary)] hover:bg-[var(--es-bg-overlay)] transition-all text-xs font-bold font-[var(--es-font-mono)]">
              3
            </button>
            <button className="w-8 h-8 rounded border border-[var(--es-border-default)]/30 flex items-center justify-center text-[var(--es-text-tertiary)] hover:bg-[var(--es-bg-overlay)] transition-all">
              <span className="material-symbols-outlined text-sm">
                chevron_right
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Cards */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Presence Legend */}
        <div className="bg-[#161b28] p-6 rounded-xl border border-[var(--es-border-subtle)]/10">
          <h3 className="font-bold text-xs uppercase tracking-widest text-[var(--es-text-tertiary)] mb-4">
            Operator Presence Markers
          </h3>
          <div className="grid grid-cols-3 gap-3">
            {PRESENCE_LEGEND.map((p) => (
              <div key={p.label} className="flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded"
                  style={{ background: p.color }}
                />
                <span className="font-[var(--es-font-mono)] text-[10px] text-[var(--es-text-secondary)]">
                  {p.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Security Card */}
        <div className="bg-[#161b28] p-6 rounded-xl border border-[var(--es-border-subtle)]/10 flex items-center gap-6">
          <div className="w-16 h-16 rounded-full bg-[var(--es-accent)]/5 border border-[var(--es-accent)]/20 flex items-center justify-center">
            <span className="material-symbols-outlined text-[var(--es-accent)] text-3xl">
              shield_person
            </span>
          </div>
          <div>
            <h3 className="font-bold text-xs uppercase tracking-widest text-[var(--es-text-tertiary)] mb-1">
              Access Security
            </h3>
            <p className="text-xs text-[var(--es-text-secondary)] mb-3">
              All dashboard actions are logged. 2FA is mandatory for Admin
              roles.
            </p>
            <button className="text-[10px] font-bold uppercase tracking-widest text-[#ffb599] hover:underline">
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
    <div className={`bg-[#161b28] p-5 rounded-xl border-l-4 ${borderColor}`}>
      <p className="text-[10px] uppercase tracking-widest text-[var(--es-text-tertiary)] font-bold mb-1">
        {label}
      </p>
      <p className="text-2xl font-bold text-[var(--es-text-primary)]">
        {value}
      </p>
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
