// Test-runner-owned transparent loopback proxy. No production code/test headers.
// Holds a real Appwrite transaction at a controlled boundary for race proofs.
export function proofProxy(upstream: string, writerKey: string) {
	const token = crypto.randomUUID();
	type Plan = {
		postId: string;
		phase: "anchor" | "signal" | "commit" | "signature";
		when: "before" | "after" | "fail";
		hit: boolean;
		release: () => void;
		wait: Promise<void>;
	};
	let plan: Plan | undefined;
	const transactions = new Map<string, string>();
	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		async fetch(request) {
			const url = new URL(request.url);
			if (url.pathname === "/signature") {
				if (request.headers.get("x-proof-token") !== token)
					return new Response(null, { status: 403 });
				const gate =
					plan?.phase === "signature" && !plan.hit ? plan : undefined;
				if (gate) {
					gate.hit = true;
					await gate.wait;
				}
				return Response.json({
					url: "https://signing.invalid/synthetic-capability",
				});
			}
			if (url.pathname === "/control") {
				if (request.headers.get("x-proof-token") !== token)
					return new Response(null, { status: 403 });
				if (request.method === "POST") {
					const input = (await request.json()) as Pick<
						Plan,
						"postId" | "phase" | "when"
					>;
					if (
						!["anchor", "signal", "commit", "signature"].includes(
							input.phase,
						) ||
						!["before", "after", "fail"].includes(input.when) ||
						!/^social-/.test(input.postId)
					)
						return new Response(null, { status: 400 });
					plan?.release();
					let release!: () => void;
					const wait = new Promise<void>((resolve) => {
						release = resolve;
					});
					plan = { ...input, hit: false, wait, release };
				} else if (request.method === "DELETE") {
					plan?.release();
					plan = undefined;
				}
				return Response.json({ hit: plan?.hit ?? false });
			}
			const data = ["GET", "HEAD"].includes(request.method)
				? undefined
				: await request.arrayBuffer();
			let payload: Record<string, unknown> = {};
			try {
				if (data) payload = JSON.parse(new TextDecoder().decode(data));
			} catch {}
			const ownWriter = request.headers.get("x-appwrite-key") === writerKey;
			const parent = url.pathname.match(/\/tables\/posts\/rows\/([^/]+)$/);
			if (
				ownWriter &&
				request.method === "PATCH" &&
				parent &&
				typeof payload.transactionId === "string"
			)
				transactions.set(payload.transactionId, parent[1] ?? "");
			const commit = url.pathname.match(/\/transactions\/([^/]+)$/);
			const signal = url.pathname.match(/\/tables\/signals\/rows\/([^/]+)$/);
			const phase =
				signal &&
				request.method === "PATCH" &&
				typeof payload.transactionId === "string"
					? "signal"
					: parent
						? "anchor"
						: commit && payload.commit === true
							? "commit"
							: null;
			const postId =
				parent?.[1] ??
				(typeof payload.transactionId === "string"
					? transactions.get(payload.transactionId)
					: commit
						? transactions.get(commit[1] ?? "")
						: undefined);
			const gate =
				ownWriter &&
				plan &&
				!plan.hit &&
				plan.postId === postId &&
				plan.phase === phase
					? plan
					: undefined;
			const hold = async () => {
				if (gate) {
					gate.hit = true;
					await gate.wait;
				}
			};
			if (gate?.when === "fail") {
				gate.hit = true;
				return Response.json(
					{
						message: "Synthetic transaction failure",
						code: 503,
						type: "general_server_error",
						version: "2.6.2",
					},
					{ status: 503 },
				);
			}
			if (gate?.when === "before") await hold();
			const h = new Headers(request.headers);
			h.delete("host");
			const target = new URL(`${url.pathname}${url.search}`, upstream);
			const response = await fetch(target, {
				method: request.method,
				headers: h,
				body: data,
				redirect: "manual",
			});
			const bytes = await response.arrayBuffer(),
				headers = new Headers(response.headers);
			headers.delete("content-encoding");
			headers.delete("content-length");
			if (gate?.when === "after") await hold();
			return new Response(bytes, { status: response.status, headers });
		},
	});
	return {
		endpoint: `${server.url.origin}/v1`,
		control: `${server.url.origin}/control`,
		token,
		stop: () => {
			plan?.release();
			server.stop(true);
		},
	};
}
