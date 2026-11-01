export const lifecycleMessages = {
	fr: {
		publish: "Publier le brouillon",
		archive: "Archiver",
		remove: "Supprimer la publication",
		confirm: "Confirmer la suppression",
		cancel: "Annuler",
		warning:
			"La publication sera retirée immédiatement. Le nettoyage peut être repris depuis cette page.",
		replace: "Remplacer la vidéo et la couverture",
		video: "Nouvelle vidéo MP4",
		thumbnail: "Nouvelle couverture WebP",
		resume: "Reprendre le nettoyage",
		pending: "Nettoyage à terminer",
		done: "Modification enregistrée",
		busy: "Traitement…",
		privateArchive:
			"Une archive reste consultable par son propriétaire. La suppression coupe aussi ses accès média privés.",
		unavailable: "Impossible de terminer. Rechargez ou reprenez le nettoyage.",
	},
	en: {
		publish: "Publish draft",
		archive: "Archive",
		remove: "Delete post",
		confirm: "Confirm deletion",
		cancel: "Cancel",
		warning:
			"The post will be withdrawn immediately. Cleanup can be resumed from this page.",
		replace: "Replace video and cover",
		video: "New MP4 video",
		thumbnail: "New WebP cover",
		resume: "Resume cleanup",
		pending: "Cleanup pending",
		done: "Change saved",
		busy: "Processing…",
		privateArchive:
			"An archive remains available to its owner. Deletion also removes private media access.",
		unavailable: "Unable to finish. Reload or resume cleanup.",
	},
} as const;
