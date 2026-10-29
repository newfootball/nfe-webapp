export type ProfileLocale = "fr" | "en";
export function validLocale(value: unknown): value is ProfileLocale {
	return value === "fr" || value === "en";
}
export function detectLocale(
	cookie: unknown,
	header: string | null,
): ProfileLocale {
	if (validLocale(cookie)) return cookie;
	const choices = (header ?? "")
		.split(",")
		.map((part, index) => {
			const [tag, ...parameters] = part.trim().toLowerCase().split(";");
			const weight = parameters.find((p) => p.trim().startsWith("q="));
			const q = weight === undefined ? 1 : Number(weight.trim().slice(2));
			return { tag: tag?.split("-")[0], q, index };
		})
		.filter(
			(v) => validLocale(v.tag) && Number.isFinite(v.q) && v.q > 0 && v.q <= 1,
		)
		.sort((a, b) => b.q - a.q || a.index - b.index);
	return (choices[0]?.tag as ProfileLocale | undefined) ?? "fr";
}
