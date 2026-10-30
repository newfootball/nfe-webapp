import { z } from "zod";
export const DIRECTORY_TYPES = [
	"players",
	"coaches",
	"recruiters",
	"clubs",
] as const;
export const DIRECTORY_POSITIONS = [
	"goalkeeper",
	"centre-back",
	"right-back",
	"left-back",
	"defensive-midfielder",
	"centre-midfielder",
	"attacking-midfielder",
	"right-winger",
	"left-winger",
	"centre-forward",
	"striker",
] as const;
export const DIRECTORY_CITIES = [
	"paris",
	"marseille",
	"lyon",
	"toulouse",
	"nice",
	"nantes",
	"strasbourg",
	"montpellier",
	"bordeaux",
	"lille",
] as const;
export const DirectorySchema = z
	.strictObject({
		type: z.enum(DIRECTORY_TYPES),
		position: z.enum(DIRECTORY_POSITIONS).optional(),
		city: z.enum(DIRECTORY_CITIES).optional(),
		page: z.number().int().min(1).max(50).default(1),
	})
	.refine((v) => v.type === "players" || (!v.city && !v.position));
export type DirectoryInput = z.infer<typeof DirectorySchema>;
export const directoryLabels = {
	fr: {
		players: "Joueurs",
		coaches: "Entraîneurs",
		recruiters: "Recruteurs",
		clubs: "Clubs",
		empty: "Aucun profil trouvé.",
		next: "Page suivante",
		previous: "Page précédente",
	},
	en: {
		players: "Players",
		coaches: "Coaches",
		recruiters: "Recruiters",
		clubs: "Clubs",
		empty: "No profiles found.",
		next: "Next page",
		previous: "Previous page",
	},
};

const positionTitles = {
	fr: [
		"Gardiens de but",
		"Défenseurs centraux",
		"Arrières droits",
		"Arrières gauches",
		"Milieux défensifs",
		"Milieux centraux",
		"Milieux offensifs",
		"Ailiers droits",
		"Ailiers gauches",
		"Avants-centres",
		"Attaquants",
	],
	en: [
		"Goalkeepers",
		"Centre-backs",
		"Right-backs",
		"Left-backs",
		"Defensive midfielders",
		"Central midfielders",
		"Attacking midfielders",
		"Right wingers",
		"Left wingers",
		"Centre-forwards",
		"Strikers",
	],
};
export function directoryTitle(locale: "fr" | "en", input: DirectoryInput) {
	if (input.position)
		return (
			positionTitles[locale][DIRECTORY_POSITIONS.indexOf(input.position)] ??
			directoryLabels[locale].players
		);
	const title = directoryLabels[locale][input.type];
	return input.city
		? `${title} ${locale === "fr" ? "à" : "in"} ${input.city[0]?.toUpperCase()}${input.city.slice(1)}`
		: title;
}
