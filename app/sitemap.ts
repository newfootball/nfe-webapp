import { env } from "@/lib/env";
import { getSeo } from "@/src/query/seo.query";
import type { MetadataRoute } from "next";

const WEBSITE_URL = env.WEBSITE_URL;

type ChangeFrequency =
	| "always"
	| "hourly"
	| "daily"
	| "weekly"
	| "monthly"
	| "yearly"
	| "never";

export default function sitemap(): MetadataRoute.Sitemap {
	// Base routes
	const baseRoutes: MetadataRoute.Sitemap = [
		{
			url: WEBSITE_URL,
			images: [`${WEBSITE_URL}/images/logo/logo-color.png`],
			lastModified: new Date().toISOString(),
			changeFrequency: "monthly",
			priority: 1,
		},
		{
			url: `${WEBSITE_URL}/about-us`,
			lastModified: new Date().toISOString(),
			changeFrequency: "monthly",
			priority: 0.8,
		},
		{
			url: `${WEBSITE_URL}/job-offers`,
			lastModified: new Date().toISOString(),
			changeFrequency: "daily",
			priority: 0.8,
		},
		{
			url: `${WEBSITE_URL}/blog`,
			lastModified: new Date().toISOString(),
			changeFrequency: "daily",
			priority: 0.8,
		},
		{
			url: `${WEBSITE_URL}/legal`,
			lastModified: new Date().toISOString(),
			changeFrequency: "yearly",
			priority: 0.5,
		},
		{
			url: `${WEBSITE_URL}/cgv`,
			lastModified: new Date().toISOString(),
			changeFrequency: "yearly",
			priority: 0.5,
		},
		{
			url: `${WEBSITE_URL}/partnerships`,
			lastModified: new Date().toISOString(),
			changeFrequency: "monthly",
			priority: 0.8,
		},
	];

	// Generate routes from SEO_DATA
	const seoRoutes: MetadataRoute.Sitemap = getSeo().map((route) => ({
		url: `${WEBSITE_URL}${route.path}`,
		lastModified: new Date().toISOString(),
		changeFrequency: "monthly" as ChangeFrequency,
		priority: 0.9,
	}));

	// Combine and return all routes
	return [...baseRoutes, ...seoRoutes];
}
