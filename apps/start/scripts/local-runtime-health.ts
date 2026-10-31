import { readDependencyReport } from "./local-runtime-dependencies";

export async function localHealth(
	pathname: string,
	draining: boolean,
): Promise<Response | undefined> {
	if (
		process.env.START_LOCAL_RUNTIME !== "1" ||
		!["/_local/health", "/_local/ready"].includes(pathname)
	)
		return;
	const respond = (status: number) =>
		Response.json(
			{ status: status === 200 ? "ok" : "unavailable" },
			{ status, headers: { "Cache-Control": "no-store" } },
		);
	if (draining) return respond(503);
	if (pathname === "/_local/health") return respond(200);
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 4000);
	try {
		if (
			process.env.START_APPWRITE_ENDPOINT !== "http://127.0.0.1:18464/v1" ||
			process.env.START_APPWRITE_PROJECT !== "nfe-local" ||
			process.env.START_APPWRITE_DATABASE !== "nfe-local" ||
			!(await readDependencyReport())
		)
			return respond(503);
		async function read(path: string, key: string | undefined) {
			if (!key) throw new Error("Readiness key missing");
			const response = await fetch(`http://127.0.0.1:18464/v1${path}`, {
				signal: controller.signal,
				headers: { "X-Appwrite-Project": "nfe-local", "X-Appwrite-Key": key },
			});
			if (!response.ok) throw new Error("Dependency unavailable");
			return (await response.json()) as {
				status?: string;
				version?: string;
				digest?: string;
				statuses?: { status: string }[];
				total?: number;
			};
		}
		const healthKey = process.env.START_LOCAL_HEALTH_KEY;
		const [version, ...dependencies] = await Promise.all([
			read("/health/version", healthKey),
			...["/health/db", "/health/cache", "/health/geo"].map((path) =>
				read(path, healthKey),
			),
		]);
		if (
			version?.version !== "2.6.2" ||
			dependencies.some(
				(dependency) =>
					dependency.status !== "pass" &&
					!(
						dependency.total &&
						dependency.statuses?.length === dependency.total &&
						dependency.statuses.every((item) => item.status === "pass")
					),
			)
		)
			return respond(503);
		await Promise.all(
			["v1", "v2-club-profile", "v3-media-allocations", "messaging-v1"].map(
				(rowId) =>
					read(
						`/tablesdb/nfe-local/tables/schema_versions/rows/${rowId}`,
						process.env.START_APPWRITE_FEED_READER_KEY,
					),
			),
		);
		return respond(200);
	} catch {
		return respond(503);
	} finally {
		controller.abort();
		clearTimeout(timeout);
	}
}
