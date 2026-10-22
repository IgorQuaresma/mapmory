import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';

export const queryKeys = {
  session: ['session'] as const,
  catalog: ['catalog'] as const,
  projects: ['projects'] as const,
  project: (id: string) => ['project', id] as const,
  exports: (projectId: string) => ['exports', projectId] as const,
  exportJob: (id: string) => ['export', id] as const,
};

export function useSession(options: { pollWhileSignedOut?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.session,
    queryFn: () => api.getSession(),
    staleTime: 60_000,
    // While waiting for a magic link to be opened (possibly in another tab), poll the session.
    refetchInterval: (q) => (options.pollWhileSignedOut && !q.state.data?.user ? 3000 : false),
  });
}

export function useCatalog() {
  return useQuery({ queryKey: queryKeys.catalog, queryFn: () => api.catalog(), staleTime: Infinity });
}

export function useInvalidateSession() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: queryKeys.session });
}
