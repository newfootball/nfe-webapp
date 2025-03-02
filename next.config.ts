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
		],
	},
	experimental: {
		serverActions: {
			bodySizeLimit: "100mb",
		},
	},
	// Transpile Prisma and other packages that need Node.js modules
	transpilePackages: ["@prisma/client", "@auth/prisma-adapter"],
	webpack: (config, { isServer }) => {
		if (!isServer) {
			// Don't attempt to import these Node.js modules in the browser
			config.resolve.fallback = {
				...config.resolve.fallback,
				fs: false,
				child_process: false,
				"fs/promises": false,
				async_hooks: false,
				net: false,
				tls: false,
				os: false,
				path: false,
				crypto: false,
			};
		}

		if (isServer) {
			// Ensure Prisma is treated as a server-only package
			config.externals = [...(config.externals || []), "@prisma/client"];
		}

		return config;
	},
};

export default nextConfig;
