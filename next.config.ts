import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
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
		dangerouslyAllowLocalIP: true,
	},
	experimental: {
		serverActions: {
			bodySizeLimit: "10mb",
		},
	},
};

const withNextIntl = createNextIntlPlugin();
export default withNextIntl(nextConfig);
