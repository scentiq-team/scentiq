import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { isApiError } from '@/services/api/errors';

/**
 * Server-state defaults (ADR-0013). A request the server rejected with a 4xx will fail the same
 * way again, so only network problems and 5xx answers get one automatic retry.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          const rejected = isApiError(error) && error.status !== undefined && error.status < 500;
          return !rejected && failureCount < 1;
        },
      },
    },
  });
}

export function AppProviders({ children, client }: { children: ReactNode; client?: QueryClient }) {
  const [queryClient] = useState(() => client ?? createQueryClient());
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
