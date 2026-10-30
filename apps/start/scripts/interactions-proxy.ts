// Test-runner-owned transparent loopback proxy. No production code/test headers.
// Holds a real Appwrite transaction at a controlled boundary for race proofs.
export function proofProxy(upstream: string, writerKey: string) {
	const token = crypto.randomUUID();
	type Plan = {
		postId: string;
		phase: "anchor" | "commit";
		when: "before" | "after";
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
			if (url.pathname === "/control") {
				if (request.headers.get("x-proof-token") !== token)
					return new Response(null, { status: 403 });
				if (request.method === "POST") {
					const input = (await request.json()) as Pick<
						Plan,
						"postId" | "phase" | "when"
					>;
					if (
						!["anchor", "commit"].includes(input.phase) ||
						!["before", "after"].includes(input.when) ||
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
			const phase = parent
				? "anchor"
				: commit && payload.commit === true
					? "commit"
					: null;
			const postId =
				parent?.[1] ?? (commit ? transactions.get(commit[1] ?? "") : undefined);
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
