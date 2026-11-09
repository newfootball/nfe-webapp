import "@tanstack/react-start/server-only";
import { Query } from "node-appwrite";
import { isAccountActive } from "./account-lifecycle-anchor.server";
import {
	DIRECTORY_CITIES,
	DIRECTORY_POSITIONS,
	DIRECTORY_TYPES,
} from "./directory-input";
import { publicReadConnection } from "./feed.server";
export function escapeXml(value: string) {
	return value.replace(
		/[<>&"']/g,
		(char) =>
			({
				"<": "&lt;",
				">": "&gt;",
				"&": "&amp;",
				'"': "&quot;",
				"'": "&apos;",
			})[char] ?? char,
	);
}
export async function sitemapResponse(request: Request) {
	try {
		const origin = new URL(request.url).origin;
		const c = publicReadConnection();
		const [profiles, posts] = await Promise.all([
			c.publicDB.listRows({
				databaseId: c.databaseId,
				tableId: "profiles",
				total: false,
				queries: [
					Query.equal("isOnboarded", true),
					Query.orderDesc("updatedAt"),
					Query.orderDesc("$id"),
					Query.select(["$id"]),
					Query.limit(500),
				],
			}),
			c.publicDB.listRows({
				databaseId: c.databaseId,
				tableId: "posts",
				total: false,
				queries: [
					Query.equal("status", "PUBLISHED"),
					Query.orderDesc("updatedAt"),
					Query.orderDesc("$id"),
					Query.select(["$id", "userId"]),
					Query.limit(1000),
				],
			}),
		]);
		// An orphan or withdrawn author must not enter the public sitemap. Check
		// only authors of this bounded post batch, through keyless permissions.
		const authorIds = [...new Set(posts.rows.map((row) => String(row.userId)))];
		const eligible = new Set<string>();
		for (let offset = 0; offset < authorIds.length; offset += 100) {
			const rows = await c.publicDB.listRows({
				databaseId: c.databaseId,
				tableId: "profiles",
				total: false,
				queries: [
					Query.equal("isOnboarded", true),
					Query.equal("$id", authorIds.slice(offset, offset + 100)),
					Query.select(["$id"]),
					Query.limit(100),
				],
			});
			for (const row of rows.rows) eligible.add(row.$id);
		}
		const ids = [
			...new Set([...profiles.rows.map((row) => row.$id), ...eligible]),
		];
		const active = new Set(
			(
				await Promise.all(
					ids.map(async (id) => ((await isAccountActive(id)) ? id : null)),
				)
			).filter((id): id is string => id !== null),
		);
		const localized = (path: string) => [`/fr${path}`, `/en${path}`];
		const paths = [
			...localized(""),
			"/about-us",
			"/contact",
			"/privacy",
			"/terms",
			...localized("/explore"),
			...DIRECTORY_TYPES.map((v) => `/${v}`),
			...DIRECTORY_POSITIONS.map((v) => `/players/${v}`),
			...DIRECTORY_CITIES.map((v) => `/players/city/${v}`),
			...profiles.rows
				.filter((row) => active.has(row.$id))
				.flatMap((row) => localized(`/user/${encodeURIComponent(row.$id)}`)),
			...posts.rows
				.filter(
					(row) =>
						eligible.has(String(row.userId)) && active.has(String(row.userId)),
				)
				.flatMap((row) => localized(`/post/${encodeURIComponent(row.$id)}`)),
		];
		return new Response(
			`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((path) => `<url><loc>${escapeXml(new URL(path, origin).href)}</loc></url>`).join("")}</urlset>`,
			{
				headers: {
					"Content-Type": "application/xml; charset=utf-8",
					"Cache-Control": "private, no-store",
					"X-Robots-Tag": "noindex, nofollow",
				},
			},
		);
	} catch {
		return new Response("Sitemap unavailable", {
			status: 503,
			headers: {
				"Cache-Control": "no-store",
				"X-Robots-Tag": "noindex, nofollow",
			},
		});
	}
}
