import { useEffect } from "react";

// Reports uncaught browser errors to the production entry, which redacts and
// logs them. Only the message and the path leave the page: no stack, query,
// user data or storage content.
const endpoint = "/_diag/client-error";
const maxReports = 5;

export function ClientDiagnostics() {
	useEffect(() => {
		if (!import.meta.env.PROD || !navigator.sendBeacon) return;
		let sent = 0;
		const report = (kind: string, value: unknown) => {
			if (sent >= maxReports) return;
			sent += 1;
			const message =
				value instanceof Error
					? `${value.name}: ${value.message}`
					: String(value ?? "unknown");
			navigator.sendBeacon(
				endpoint,
				new Blob(
					[
						JSON.stringify({
							kind,
							message: message.slice(0, 500),
							path: location.pathname,
						}),
					],
					{ type: "application/json" },
				),
			);
		};
		const onError = (event: ErrorEvent) =>
			report("error", event.error ?? event.message);
		const onRejection = (event: PromiseRejectionEvent) =>
			report("unhandledrejection", event.reason);
		window.addEventListener("error", onError);
		window.addEventListener("unhandledrejection", onRejection);
		return () => {
			window.removeEventListener("error", onError);
			window.removeEventListener("unhandledrejection", onRejection);
		};
	}, []);
	return null;
}
