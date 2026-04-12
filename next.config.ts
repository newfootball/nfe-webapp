import withPWA from "@ducanh2912/next-pwa";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const pwa = withPWA({
	dest: "public",
	cacheOnFrontEndNav: true,
	aggressiveFrontEndNavCaching: true,
	reloadOnOnline: true,
	fallbacks: {
		document: "/offline",
	},
	extendDefaultRuntimeCaching: true,
	workboxOptions: {
		disableDevLogs: true,
		runtimeCaching: [
			{
				urlPattern: /^https:\/\/res\.cloudinary\.com\/.*/i,
				handler: "CacheFirst",
				options: {
					cacheName: "cloudinary-images",
					expiration: {
						maxEntries: 200,
						maxAgeSeconds: 30 * 24 * 60 * 60,
					},
					cacheableResponse: { statuses: [200] },
				},
			},
			{
				urlPattern: /^https:\/\/images\.unsplash\.com\/.*/i,
				handler: "CacheFirst",
				options: {
					cacheName: "unsplash-images",
					expiration: {
						maxEntries: 100,
						maxAgeSeconds: 7 * 24 * 60 * 60,
					},
					cacheableResponse: { statuses: [200] },
				},
			},
			{
				urlPattern: /\/api\/.*/i,
				handler: "NetworkOnly",
			},
			{
				urlPattern: /\/_next\/static\/.*/i,
				handler: "CacheFirst",
				options: {
					cacheName: "next-static",
					expiration: {
						maxEntries: 500,
						maxAgeSeconds: 365 * 24 * 60 * 60,
					},
				},
			},
			{
				urlPattern: /\/_next\/image\?.*/i,
				handler: "StaleWhileRevalidate",
				options: {
					cacheName: "next-image",
					expiration: {
						maxEntries: 300,
						maxAgeSeconds: 7 * 24 * 60 * 60,
					},
				},
			},
			{
				urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
				handler: "CacheFirst",
				options: {
					cacheName: "google-fonts",
					expiration: {
						maxEntries: 10,
						maxAgeSeconds: 365 * 24 * 60 * 60,
					},
					cacheableResponse: { statuses: [200] },
				},
			},
		],
	},
});

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
export default pwa(withNextIntl(nextConfig));
