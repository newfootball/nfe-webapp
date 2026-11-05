import type { PublicPost } from "./feed-contract";

const DAY = 86_400_000;
export const LIKE_WEIGHT = 3;
export function weekWindow(now = new Date()) {
	const t = now.getTime(),
		day = (now.getUTCDay() + 6) % 7,
		monday = new Date(
			Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day),
		),
		thursday = new Date(monday.getTime() + 3 * DAY),
		yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1);
	return {
		now: now.toISOString(),
		since: new Date(t - 7 * DAY).toISOString(),
		previousSince: new Date(t - 14 * DAY).toISOString(),
		weekStart: monday.toISOString().slice(0, 10),
		weekEnd: new Date(monday.getTime() + 6 * DAY).toISOString().slice(0, 10),
		weekNumber: Math.floor((thursday.getTime() - yearStart) / (7 * DAY)) + 1,
	};
}
export const viewDay = (now = new Date()) => now.toISOString().slice(0, 10);
export function trend(current: number, previous: number) {
	return previous > 0
		? Math.round(((current - previous) / previous) * 100)
		: null;
}
export function rankFeatured(
	views: Map<string, number>,
	likes: Map<string, number>,
) {
	const score = (id: string) =>
		(views.get(id) ?? 0) + LIKE_WEIGHT * (likes.get(id) ?? 0);
	return [...new Set([...views.keys(), ...likes.keys()])]
		.filter((id) => score(id) > 0)
		.sort((a, b) => score(b) - score(a) || (a < b ? -1 : 1));
}
const COMPLETION = [
	"image",
	"biography",
	"position",
	"foot",
	"localisation",
	"jerseyNumber",
	"club",
] as const;
export type CompletionField = (typeof COMPLETION)[number];
export function completion(profile: Record<CompletionField, unknown>) {
	const filled = (v: unknown) =>
		Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined && v !== "";
	const missing = COMPLETION.find((k) => !filled(profile[k])) ?? null;
	return {
		percent: Math.round(
			(COMPLETION.filter((k) => filled(profile[k])).length /
				COMPLETION.length) *
				100,
		),
		missing,
	};
}
export type WeekStats = {
	weekStart: string;
	weekEnd: string;
	name: string | null;
	jerseyNumber: number | null;
	posts: number;
	views: number;
	viewsTrend: number | null;
	followers: number;
	newFollowers: number;
	topTitle: string | null;
	completion: ReturnType<typeof completion>;
};
export type Featured = {
	post: PublicPost;
	views: number;
	weekNumber: number;
	pinned: boolean;
};
export type HomeData = {
	signedIn: boolean;
	week: WeekStats | null;
	featured: Featured | null;
	locker: PublicPost[];
	canPin: boolean;
};
export type Badge = {
	id: string;
	name: string | null;
	image: string | null;
	jerseyNumber: number | null;
} | null;
const UNITS = [
	["day", 86_400_000],
	["hour", 3_600_000],
	["minute", 60_000],
] as const;
// Compact broadcast-style age: "2 h", "1 j"; older than a week falls back to a date.
export function ago(iso: string, locale: string, now = Date.now()) {
	const elapsed = Math.max(0, now - Date.parse(iso));
	if (elapsed >= 7 * 86_400_000)
		return new Intl.DateTimeFormat(locale, {
			day: "numeric",
			month: "short",
		}).format(new Date(iso));
	const [unit, size] = UNITS.find(([, ms]) => elapsed >= ms) ?? UNITS[2];
	return new Intl.NumberFormat(locale, {
		style: "unit",
		unit,
		unitDisplay: "narrow",
	}).format(Math.max(unit === "minute" ? 1 : 0, Math.floor(elapsed / size)));
}
export const compact = (n: number, locale: string) =>
	new Intl.NumberFormat(locale, {
		notation: n >= 10_000 ? "compact" : "standard",
		maximumFractionDigits: 1,
	}).format(n);
// Broadcast code: club prefixes (FC, AS…) and age groups (U17) are dropped, then
// initials of a multi-word name, else its first three letters.
export function teamCode(name: string) {
	const words = name
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toUpperCase()
		.split(/[^A-Z0-9]+/)
		.filter((w) => w.length > 2 && !/^U\d+$/.test(w));
	const code =
		words.length > 1
			? words.map((w) => w[0]).join("")
			: (words[0] ?? "").slice(0, 3);
	return code.slice(0, 4) || "—";
}
