export const messages = {
	fr: {
		home: "Accueil",
		about: "À propos",
		title: "Le football commence ici",
		intro: "Un nouvel espace pour les joueurs, entraîneurs et clubs.",
		aboutTitle: "Notre terrain de jeu",
		aboutText: "Retrouvez bientôt la communauté Next Football Experience.",
		theme: "Changer le thème",
		missing: "Page introuvable",
		error: "Une erreur est survenue",
		retry: "Réessayer",
	},
	en: {
		home: "Home",
		about: "About",
		title: "Football starts here",
		intro: "A new space for players, coaches and clubs.",
		aboutTitle: "Our playing field",
		aboutText: "The Next Football Experience community is coming soon.",
		theme: "Change theme",
		missing: "Page not found",
		error: "Something went wrong",
		retry: "Try again",
	},
};
export type Locale = keyof typeof messages;
