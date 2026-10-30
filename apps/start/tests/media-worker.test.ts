import { expect, test } from "bun:test";
import { runInNewContext } from "node:vm";
import { serviceWorker } from "../src/lib/platform-pwa";

test("worker leaves signed cross-origin native Range transport untouched", () => {
	const handlers = new Map<string, (event: unknown) => void>();
	const fetched: unknown[] = [];
	runInNewContext(serviceWorker, {
		URL,
		self: {
			location: { origin: "https://app.example.test" },
			addEventListener: (name: string, handler: (event: unknown) => void) =>
				handlers.set(name, handler),
		},
		fetch: (...args: unknown[]) => {
			fetched.push(args);
			return Promise.resolve(new Response());
		},
	});
	let intercepted = false;
	const handler = handlers.get("fetch");
	expect(handler).toBeDefined();
	handler?.({
		request: new Request(
			"https://s3.eu-central-003.backblazeb2.com/owned?X-Amz-Signature=synthetic",
			{ headers: { Range: "bytes=1024-" } },
		),
		respondWith: () => {
			intercepted = true;
		},
	});
	expect(intercepted).toBe(false);
	expect(fetched).toHaveLength(0);
	// Private same-origin reads still take the network-only path.
	handler?.({
		request: new Request("https://app.example.test/_serverFn/private"),
		respondWith: () => {
			intercepted = true;
		},
	});
	expect(intercepted).toBe(true);
	expect(fetched).toHaveLength(1);
	expect((fetched[0] as unknown[])[1]).toEqual({ cache: "no-store" });
});
