import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
	return {
		name: "Next Football Experience",
		short_name: "NFE",
		description:
			"Le réseau social du football amateur — partagez vos vidéos, suivez des joueurs, connectez-vous avec des clubs.",
		start_url: "/",
		scope: "/",
		display: "standalone",
		display_override: ["window-controls-overlay", "standalone", "browser"],
		orientation: "portrait",
		background_color: "#ffffff",
		theme_color: "#FACC15",
		categories: ["sports", "social"],
		lang: "fr",
		dir: "ltr",
		icons: [
			{
				src: "/icons/48.png",
				sizes: "48x48",
				type: "image/png",
				purpose: "any",
			},
			{
				src: "/icons/72.png",
				sizes: "72x72",
				type: "image/png",
				purpose: "any",
			},
			{
				src: "/icons/96.png",
				sizes: "96x96",
				type: "image/png",
				purpose: "any",
			},
			{
				src: "/icons/144.png",
				sizes: "144x144",
				type: "image/png",
				purpose: "any",
			},
			{
				src: "/icons/192.png",
				sizes: "192x192",
				type: "image/png",
				purpose: "any",
			},
			{
				src: "/icons/192.png",
				sizes: "192x192",
				type: "image/png",
				purpose: "maskable",
			},
			{
				src: "/icons/512.png",
				sizes: "512x512",
				type: "image/png",
				purpose: "any",
			},
			{
				src: "/icons/512.png",
				sizes: "512x512",
				type: "image/png",
				purpose: "maskable",
			},
		],
		shortcuts: [
			{
				name: "Explorer",
				short_name: "Explorer",
				description: "Découvrir des joueurs et des clubs",
				url: "/explore",
				icons: [{ src: "/icons/96.png", sizes: "96x96" }],
			},
			{
				name: "Messages",
				short_name: "Messages",
				description: "Voir vos messages",
				url: "/messages",
				icons: [{ src: "/icons/96.png", sizes: "96x96" }],
			},
			{
				name: "Nouveau post",
				short_name: "Post",
				description: "Créer une nouvelle publication",
				url: "/post/new",
				icons: [{ src: "/icons/96.png", sizes: "96x96" }],
			},
		],
		prefer_related_applications: false,
	};
}
