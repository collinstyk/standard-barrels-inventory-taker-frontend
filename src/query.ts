import { QueryClient } from "@tanstack/react-query";
import { ApiError, session } from "./api";

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
