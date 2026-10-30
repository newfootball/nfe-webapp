export const messagingMessages = {
	fr: {
		title: "Messages",
		search: "Rechercher un interlocuteur",
		policy:
			"Pour démarrer, vous devez vous suivre dans au moins un sens, ou avoir déjà échangé. Les deux profils doivent être complétés.",
		empty: "Aucune conversation.",
		emptyHistory: "Aucun message.",
		more: "Charger la suite",
		loading: "Chargement…",
		retry: "Réessayer",
		send: "Envoyer",
		content: "Votre message",
		read: "Lu",
		unread: "Non lu",
		markRead: "Marquer les messages reçus comme lus",
		refresh: "Actualiser",
		back: "Conversations",
		pending: "Envoi…",
		errors: {
			unauthorized: "Connectez-vous pour lire vos messages.",
			forbidden:
				"Cette conversation n’est pas autorisée. Vérifiez le profil et votre relation.",
			origin: "Origine refusée.",
			invalid: "Message invalide (1 à 2 000 caractères).",
			unavailable: "Messagerie indisponible. Réessayez.",
			conflict: "Conflit temporaire. Réessayez avec le même message.",
			rateLimited:
				"Limite de 20 messages par minute atteinte. Patientez avant de réessayer.",
		},
	},
	en: {
		title: "Messages",
		search: "Search for someone",
		policy:
			"To start, either profile must follow the other, or you must have exchanged messages before. Both profiles must be complete.",
		empty: "No conversations.",
		emptyHistory: "No messages.",
		more: "Load more",
		loading: "Loading…",
		retry: "Retry",
		send: "Send",
		content: "Your message",
		read: "Read",
		unread: "Unread",
		markRead: "Mark received messages as read",
		refresh: "Refresh",
		back: "Conversations",
		pending: "Sending…",
		errors: {
			unauthorized: "Sign in to read your messages.",
			forbidden:
				"This conversation is not allowed. Check the profile and your relationship.",
			origin: "Origin rejected.",
			invalid: "Invalid message (1 to 2,000 characters).",
			unavailable: "Messaging unavailable. Please retry.",
			conflict: "Temporary conflict. Retry the same message.",
			rateLimited:
				"Limit of 20 messages per minute reached. Wait before retrying.",
		},
	},
} as const;
