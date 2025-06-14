import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	/* config options here */
	images: {
		remotePatterns: [
			{
				protocol: "https",
				hostname: "source.unsplash.com",
			},
			{
				protocol: "https",
				hostname: "images.unsplash.com",
			},
			{
				protocol: "https",
				hostname: "avatars.githubusercontent.com",
			},
			{
				protocol: "https",
				hostname: "prod-files-secure.s3.us-west-2.amazonaws.com",
			},
			{
				protocol: "http",
				hostname: "localhost",
			},
			{
				protocol: "https",
				hostname: "lh3.googleusercontent.com",
			},
			{
				protocol: "https",
				hostname: "console-oog0coc0cc4ccss80ocwckk4.145.223.81.185.sslip.io",
			},
			{
				protocol: "https",
				hostname: "res.cloudinary.com",
			},
			{
				protocol: "https",
				hostname: "cdn.jsdelivr.net",
			},
		],
	},
	experimental: {
		serverActions: {
			bodySizeLimit: 10 * 1024 * 1024,
		},
	},
	webpack: (config, { isServer }) => {
		if (!isServer) {
			// Ne pas inclure les modules server-only dans le bundle client
			config.resolve.fallback = {
				fs: false,
				path: false,
				child_process: false,
				"fs/promises": false,
				async_hooks: false,
			};
		}
		return config;
	},
};

export default nextConfig;
