import { expect, test } from "bun:test";
import {
	ago,
	compact,
	completion,
	rankFeatured,
	teamCode,
	trend,
	weekWindow,
} from "../src/lib/home-contract";

test("week window is a rolling 7 days anchored on Monday UTC", () => {
	const w = weekWindow(new Date("2026-11-05T10:00:00.000Z"));
	expect(w.since).toBe("2026-10-29T10:00:00.000Z");
	expect(w.previousSince).toBe("2026-10-22T10:00:00.000Z");
	expect(w.weekStart).toBe("2026-11-02");
	expect(w.weekNumber).toBe(45);
	expect(weekWindow(new Date("2026-11-02T00:00:00.000Z")).weekStart).toBe(
		"2026-11-02",
	);
	expect(weekWindow(new Date("2026-11-08T23:59:59.000Z")).weekStart).toBe(
		"2026-11-02",
	);
});
test("trend is null without a previous week, rounded percent otherwise", () => {
	expect(trend(10, 0)).toBe(null);
	expect(trend(162, 100)).toBe(62);
	expect(trend(50, 100)).toBe(-50);
});
test("featured ranking weights likes 3x and breaks ties by id", () => {
	const ranked = rankFeatured(
		new Map([
			["a", 100],
			["b", 90],
			["c", 90],
		]),
		new Map([
			["b", 4],
			["c", 4],
		]),
	);
	expect(ranked).toEqual(["b", "c", "a"]);
	expect(rankFeatured(new Map(), new Map())).toEqual([]);
});
test("profile completion counts identity fields and names the first gap", () => {
	expect(
		completion({
			image: "x",
			biography: "b",
			position: ["STRIKER"],
			foot: ["LEFT"],
			localisation: "Lyon",
			jerseyNumber: 8,
			club: null,
		}),
	).toEqual({ percent: 86, missing: "club" });
	expect(
		completion({
			image: null,
			biography: null,
			position: [],
			foot: [],
			localisation: null,
			jerseyNumber: null,
			club: null,
		}),
	).toEqual({ percent: 0, missing: "image" });
});

test("formats broadcast codes, ages and counts", () => {
	expect(teamCode("FC Lyon U17")).toBe("LYO");
	expect(teamCode("Olympique Lyonnais Féminin")).toBe("OLF");
	expect(teamCode("AS Vénissieux")).toBe("VEN");
	expect(teamCode("??")).toBe("—");
	const now = Date.parse("2026-11-05T12:00:00Z");
	expect(ago("2026-11-05T10:00:00Z", "fr", now)).toBe("2h");
	expect(ago("2026-11-04T10:00:00Z", "fr", now)).toBe("1j");
	expect(ago("2026-11-05T11:59:50Z", "en", now)).toBe("1m");
	expect(ago("2026-10-01T10:00:00Z", "fr", now)).toBe("1 oct.");
	expect(compact(4812, "fr")).toBe("4 812");
	expect(compact(48_120, "en")).toBe("48.1K");
});
