import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AuthUserDto, LoginRequest, RegisterRequest } from '@/shared/contracts';
import { ApiClientError, apiRequest } from '@/client/lib/apiClient';

export const AUTH_QUERY_KEY = ['auth', 'me'] as const;

export function useMe() {
  return useQuery<AuthUserDto | null>({
    queryKey: AUTH_QUERY_KEY,
    queryFn: async () => {
      try {
        const res = await apiRequest<{ user: AuthUserDto }>('/api/v1/auth/me');
        return res.user;
      } catch (err) {
        if (err instanceof ApiClientError && err.status === 401) {
          return null;
        }
        throw err;
      }
    },
    retry: false,
    staleTime: 60_000,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: LoginRequest) =>
      apiRequest<{ user: AuthUserDto }>('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(AUTH_QUERY_KEY, data.user);
    },
  });
}

export function useRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: RegisterRequest) =>
      apiRequest<{ user: AuthUserDto }>('/api/v1/auth/register', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(AUTH_QUERY_KEY, data.user);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiRequest<void>('/api/v1/auth/logout', {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.setQueryData(AUTH_QUERY_KEY, null);
      queryClient.removeQueries({ queryKey: ['watchlist'] });
    },
  });
}
