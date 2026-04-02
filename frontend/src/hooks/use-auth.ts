import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { qk } from "../lib/query-client";
import type { User, LoginResponse } from "../types/api";

export function useCurrentUser() {
  return useQuery({
    queryKey: qk.auth.me,
    queryFn: () => api.get<User>("/auth/me"),
    retry: false,
    enabled: !!localStorage.getItem("esexpress-token"),
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (creds: { email: string; password: string }) =>
      api.post<LoginResponse>("/auth/login", creds),
    onSuccess: (data) => {
      localStorage.setItem("esexpress-token", data.token);
      queryClient.setQueryData(qk.auth.me, data.user);
    },
  });
}

export function useLogoutFn() {
  const queryClient = useQueryClient();
  return () => {
    localStorage.removeItem("esexpress-token");
    queryClient.clear();
    window.location.href = "/login";
  };
}
