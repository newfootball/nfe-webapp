import { expect, test } from "bun:test";
import { createMemoryHistory } from "@tanstack/react-router";
import { getRouter } from "../src/router";

function routerAt(path: string) {
	const router = getRouter();
	router.update({
		...router.options,
		history: createMemoryHistory({ initialEntries: [path] }),
	});
	return router;
}

test("explore canonical URL keeps no default search params", () => {
	const router = routerAt("/fr/explore");
	const location = router.buildLocation({
		to: "/$locale/explore",
		params: { locale: "fr" },
		search: { q: "", tab: "top" },
	});
	expect(location.href).toBe("/fr/explore");
});

test("explore keeps non-default search params", () => {
	const router = routerAt("/en/explore");
	const location = router.buildLocation({
		to: "/$locale/explore",
		params: { locale: "en" },
		search: { q: "messi", tab: "users" },
	});
	expect(location.href).toBe("/en/explore?q=messi&tab=users");
});
