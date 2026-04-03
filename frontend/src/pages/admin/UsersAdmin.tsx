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
    <div className="p-8 space-y-6 max-w-5xl">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-headline font-black tracking-tight text-on-surface uppercase">
            User Management
          </h1>
          <p className="text-on-surface/30 font-label text-xs uppercase tracking-widest mt-1">
            {users.length} registered operators
          </p>
        </div>
      </div>

      <div className="space-y-[1px] bg-on-surface/5 rounded-xl overflow-hidden border border-on-surface/5">
        <div className="bg-surface-container-lowest/50 px-6 py-3">
          <h3 className="font-label text-[10px] font-bold uppercase tracking-widest text-on-surface/30">
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
              <tr className="text-on-surface/30 text-[10px] uppercase tracking-widest font-label border-b border-on-surface/5">
                <th className="px-6 py-3 font-bold">Name</th>
                <th className="px-6 py-3 font-bold">Email</th>
                <th className="px-6 py-3 font-bold">Role</th>
                <th className="px-6 py-3 font-bold text-right">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-on-surface/5">
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
                    <span className="font-label text-xs text-on-surface/40">
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
  );
}
