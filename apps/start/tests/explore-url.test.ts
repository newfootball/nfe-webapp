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

for (const path of ["/fr/explore", "/fr/admin", "/fr/sign-in"]) {
	test(`${path} server canonical adds no default search params`, () => {
		const router = routerAt(path);
		const location = router.buildLocation({
			to: path,
			search: true,
			params: true,
			_includeValidateSearch: true,
		} as never);
		expect(location.href).toBe(path);
	});
}

test("sign-in keeps a real returnTo", () => {
	const router = routerAt("/fr/sign-in?returnTo=%2Ffr%2Fprofile");
	const location = router.buildLocation({
		to: "/fr/sign-in",
		search: true,
		params: true,
		_includeValidateSearch: true,
	} as never);
	expect(location.href).toBe("/fr/sign-in?returnTo=%2Ffr%2Fprofile");
});
