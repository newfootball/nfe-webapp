import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
	return {
		name: "New Football Experience",
		short_name: "NFE",
		description: "A social network for football fans",
		start_url: "/",
		display: "standalone",
		background_color: "#ffffff",
		theme_color: "#000000",
		icons: [
			{
				src: "/icons/96.png",
				sizes: "96x96",
				type: "image/png",
			},
			{
				src: "/icons/144.png",
				sizes: "144x144",
				type: "image/png",
			},
			{
				src: "/icons/192.png",
				sizes: "192x192",
				type: "image/png",
			},
			{
				src: "/icons/512.png",
				sizes: "512x512",
				type: "image/png",
			},
		],
	};
}
