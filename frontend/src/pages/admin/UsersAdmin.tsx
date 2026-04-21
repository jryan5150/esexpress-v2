import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";

interface UserRow {
  id: number;
  email: string;
  name: string;
  role: string;
  createdAt: string;
}

const roleBadge: Record<string, string> = {
  admin:
    "bg-primary-container/20 text-primary-container border border-primary-container/30",
  dispatcher: "bg-tertiary/10 text-tertiary border border-tertiary/20",
  viewer: "bg-on-surface/5 text-on-surface/50 border border-on-surface/10",
};

export function UsersAdmin() {
  const usersQuery = useQuery({
    queryKey: ["auth", "users"],
    queryFn: () => api.get<UserRow[]>("/auth/users"),
  });

  const users = Array.isArray(usersQuery.data) ? usersQuery.data : [];

  return (
    <div className="flex flex-col h-full">
      <div className="px-7 pt-5 pb-4 border-b border-outline-variant/40 bg-surface-container-lowest header-gradient shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-1 h-8 bg-primary rounded-sm shrink-0" />
          <div>
            <h1 className="font-headline text-[22px] font-extrabold tracking-tight text-on-surface uppercase leading-tight">
              Users
            </h1>
            <p className="text-[11px] font-medium text-outline tracking-[0.08em] uppercase mt-0.5">
              Administration // Team Management
            </p>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-7 pt-5 pb-6 space-y-6">
        <div className="space-y-[1px] bg-on-surface/5 rounded-[12px] overflow-hidden border border-outline-variant/40 card-rest">
          <div className="bg-surface-container-lowest/50 px-6 py-3">
            <h3 className="font-label text-[10px] font-bold uppercase tracking-[0.06em] text-outline">
              Team Roster
            </h3>
          </div>

          {usersQuery.isLoading && (
            <div className="p-8 space-y-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-12 bg-surface-container-high/30 rounded animate-pulse"
                />
              ))}
            </div>
          )}

          {usersQuery.isError && (
            <div className="p-8 text-center text-error text-sm">
              Failed to load users
            </div>
          )}

          {users.length > 0 && (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-outline text-[10px] uppercase tracking-[0.06em] font-label border-b border-outline-variant/40">
                  <th className="px-6 py-3 font-bold">Name</th>
                  <th className="px-6 py-3 font-bold">Email</th>
                  <th className="px-6 py-3 font-bold">Role</th>
                  <th className="px-6 py-3 font-bold text-right">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/40">
                {users.map((user) => (
                  <tr
                    key={user.id}
                    className="bg-surface-container-low hover:bg-surface-container-high transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-surface-container-highest flex items-center justify-center text-xs font-bold text-primary">
                          {user.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .slice(0, 2)
                            .toUpperCase()}
                        </div>
                        <span className="font-headline text-sm font-medium text-on-surface">
                          {user.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-label text-sm text-on-surface/60">
                        {user.email}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-label font-bold uppercase tracking-tight ${roleBadge[user.role] || roleBadge.viewer}`}
                      >
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="font-label text-xs text-on-surface-variant">
                        {user.createdAt
                          ? new Date(user.createdAt).toLocaleDateString()
                          : "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
