import { Client, TablesDB } from "node-appwrite";

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
	try {
		if (
			process.env.START_APPWRITE_ENDPOINT !== "http://127.0.0.1:18464/v1" ||
			process.env.START_APPWRITE_PROJECT !== "nfe-local" ||
			process.env.START_APPWRITE_DATABASE !== "nfe-local"
		)
			return respond(503);
		const response = await fetch(
			`${process.env.START_APPWRITE_ENDPOINT}/health/version`,
			{ signal: AbortSignal.timeout(2000) },
		);
		if (
			!response.ok ||
			((await response.json()) as { version?: string }).version !== "2.6.2"
		)
			return respond(503);
		const db = new TablesDB(
			new Client()
				.setEndpoint(process.env.START_APPWRITE_ENDPOINT)
				.setProject("nfe-local")
				.setKey(process.env.START_APPWRITE_FEED_READER_KEY ?? ""),
		);
		await Promise.race([
			Promise.all(
				["v1", "v2-club-profile", "v3-media-allocations", "messaging-v1"].map(
					(rowId) =>
						db.getRow({
							databaseId: "nfe-local",
							tableId: "schema_versions",
							rowId,
						}),
				),
			),
			new Promise((_, reject) => {
				const timeout = setTimeout(
					() => reject(new Error("Readiness timed out")),
					2500,
				);
				timeout.unref();
			}),
		]);
		return respond(200);
	} catch {
		return respond(503);
	}
}
