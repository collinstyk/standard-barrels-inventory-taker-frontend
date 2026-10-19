import { QueryClient } from "@tanstack/react-query";
import { ApiError, request, session, subscribeToWrites } from "./api";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (count, error) =>
        count < 1 &&
        (!(error instanceof ApiError) ||
          error.status === 0 ||
          error.status >= 500),
    },
    // Commands must never wait offline or replay automatically on reconnect.
    mutations: { retry: false, networkMode: "always" },
  },
});
// Authenticated query data lives in memory only and is cleared on session changes.
session.subscribe(() => queryClient.clear());
// A successful server write makes cached reads stale across the workspace.
subscribeToWrites(() => void queryClient.invalidateQueries());

function readStaleTime(path: string) {
  if (path.startsWith("/inventory/")) return 5_000;
  if (path.startsWith("/sale/") || path.startsWith("/purchase/")) return 30_000;
  if (path.startsWith("/warehouses/")) return 60_000;
  return 120_000;
}

export function cachedRequest<T>(path: string): Promise<T> {
  return queryClient.fetchQuery({
    queryKey: ["api-read", path],
    queryFn: () => request<T>(path),
    staleTime: readStaleTime(path),
  });
}

export async function refreshRequest<T>(path: string): Promise<T> {
  await queryClient.invalidateQueries({ queryKey: ["api-read", path] });
  return cachedRequest<T>(path);
}
