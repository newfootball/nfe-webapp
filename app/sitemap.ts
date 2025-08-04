import { env } from "@/lib/env";
import { getPopularPostsForSitemap } from "@/src/query/post.query";
import { getSeo } from "@/src/query/seo.query";
import { getUsersForSitemap } from "@/src/query/user.query";
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

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Pages statiques principales
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: WEBSITE_URL,
      images: [`${WEBSITE_URL}/images/logo/logo-color.png`],
      lastModified: new Date().toISOString(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${WEBSITE_URL}/about-us`,
      lastModified: new Date().toISOString(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${WEBSITE_URL}/explore`,
      lastModified: new Date().toISOString(),
      changeFrequency: "hourly",
      priority: 0.9,
    },
    {
      url: `${WEBSITE_URL}/privacy`,
      lastModified: new Date().toISOString(),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${WEBSITE_URL}/terms`,
      lastModified: new Date().toISOString(),
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];

  // Pages par position de joueur
  const positions = [
    "goalkeeper",
    "centre-back",
    "right-back",
    "left-back",
    "defensive-midfielder",
    "centre-midfielder",
    "attacking-midfielder",
    "right-winger",
    "left-winger",
    "centre-forward",
    "striker",
  ];

  const positionRoutes: MetadataRoute.Sitemap = positions.map((position) => ({
    url: `${WEBSITE_URL}/players/${position}`,
    lastModified: new Date().toISOString(),
    changeFrequency: "daily" as ChangeFrequency,
    priority: 0.7,
  }));

  // Pages par type d'utilisateur
  const userTypes = ["players", "coaches", "recruiters", "clubs"];
  const userTypeRoutes: MetadataRoute.Sitemap = userTypes.map((type) => ({
    url: `${WEBSITE_URL}/${type}`,
    lastModified: new Date().toISOString(),
    changeFrequency: "daily" as ChangeFrequency,
    priority: 0.8,
  }));

  // Pages de localisation (exemples de villes principales)
  const locations = [
    "paris",
    "marseille",
    "lyon",
    "toulouse",
    "nice",
    "nantes",
    "strasbourg",
    "montpellier",
    "bordeaux",
    "lille",
  ];

  const locationRoutes: MetadataRoute.Sitemap = locations.map((city) => ({
    url: `${WEBSITE_URL}/players/city/${city}`,
    lastModified: new Date().toISOString(),
    changeFrequency: "weekly" as ChangeFrequency,
    priority: 0.6,
  }));

  // Pages de profils utilisateurs dynamiques (limité aux plus actifs)
  try {
    const activeUsers = await getUsersForSitemap();
    const userRoutes: MetadataRoute.Sitemap = activeUsers.map((user) => ({
      url: `${WEBSITE_URL}/user/${user.id}`,
      lastModified: user.updatedAt?.toISOString() || new Date().toISOString(),
      changeFrequency: "weekly" as ChangeFrequency,
      priority: 0.5,
    }));

    // Pages de posts populaires
    const popularPosts = await getPopularPostsForSitemap();
    const postRoutes: MetadataRoute.Sitemap = popularPosts.map((post) => ({
      url: `${WEBSITE_URL}/post/${post.id}`,
      lastModified: post.updatedAt.toISOString(),
      changeFrequency: "monthly" as ChangeFrequency,
      priority: 0.6,
    }));

    // Générer les routes depuis getSeo() si nécessaire
    const seoRoutes: MetadataRoute.Sitemap = getSeo().map((route) => ({
      url: `${WEBSITE_URL}${route.path}`,
      lastModified: new Date().toISOString(),
      changeFrequency: "monthly" as ChangeFrequency,
      priority: 0.7,
    }));

    // Combiner toutes les routes
    return [
      ...staticRoutes,
      ...positionRoutes,
      ...userTypeRoutes,
      ...locationRoutes,
      ...userRoutes.slice(0, 500), // Limiter à 500 profils utilisateurs
      ...postRoutes.slice(0, 1000), // Limiter à 1000 posts
      ...seoRoutes,
    ];
  } catch (error) {
    // En cas d'erreur, retourner au moins les routes statiques
    console.error("Error generating dynamic sitemap routes:", error);
    return [
      ...staticRoutes,
      ...positionRoutes,
      ...userTypeRoutes,
      ...locationRoutes,
    ];
  }
}
