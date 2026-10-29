import type { QueryClient } from "@tanstack/react-query";

// Clear all Query data, including the shell reader; no auth state lives in Zustand.
// cancelQueries prevents an in-flight response from restoring the previous account.
export async function clearIdentityCache(queryClient: QueryClient) {
	await queryClient.cancelQueries();
	queryClient.clear();
}
