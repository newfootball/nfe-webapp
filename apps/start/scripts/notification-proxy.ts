// Runner-owned origin proxy. No product RPC, test header or product fault switch.
export function notificationProxy(upstream: string, notificationKey: string) {
	if (upstream !== "http://127.0.0.1:18158/v1")
		throw new Error("Dedicated upstream required");
	const token = crypto.randomUUID();
	let failStage = false,
		recipient: string | null = null,
		hit = false,
		release = () => {};
	let waiting = Promise.resolve();
	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		async fetch(request) {
			const url = new URL(request.url);
			if (url.pathname === "/control") {
				if (request.headers.get("x-proof-token") !== token)
					return new Response(null, { status: 403 });
				if (request.method === "POST") {
					const data = (await request.json()) as {
						failStage?: boolean;
						recipient?: string;
					};
					release();
					failStage = data.failStage === true;
					recipient = data.recipient ?? null;
					hit = false;
					if (recipient && !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,35}$/.test(recipient))
						return new Response(null, { status: 400 });
					waiting = new Promise<void>((resolve) => {
						release = resolve;
					});
				} else if (request.method === "DELETE") {
					failStage = false;
					recipient = null;
					release();
				}
				return Response.json({ hit });
			}
			if (
				failStage &&
				request.method === "POST" &&
				url.pathname.endsWith("/tables/notification_outbox_v1/rows") &&
				request.headers.get("x-appwrite-key") === notificationKey
			) {
				hit = true;
				return Response.json(
					{
						message: "Synthetic stage fault",
						code: 503,
						type: "synthetic_stage_fault",
					},
					{ status: 503 },
				);
			}
			const data = ["GET", "HEAD"].includes(request.method)
				? undefined
				: await request.arrayBuffer();
			const headers = new Headers(request.headers);
			headers.delete("host");
			const response = await fetch(
				new URL(`${url.pathname}${url.search}`, upstream),
				{ method: request.method, headers, body: data, redirect: "manual" },
			);
			const bytes = await response.arrayBuffer(),
				h = new Headers(response.headers);
			h.delete("content-encoding");
			h.delete("content-length");
			if (
				recipient &&
				!hit &&
				request.method === "GET" &&
				url.pathname.endsWith("/tables/notifications_v1/rows") &&
				decodeURIComponent(url.search).includes(recipient)
			) {
				hit = true;
				await waiting;
			}
			return new Response(bytes, { status: response.status, headers: h });
		},
	});
	return {
		endpoint: `${server.url.origin}/v1`,
		control: `${server.url.origin}/control`,
		token,
		stop: () => {
			release();
			server.stop(true);
		},
	};
}
