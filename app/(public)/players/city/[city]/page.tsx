import { prisma } from "@/lib/prisma";
import { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

const cities = [
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

const cityLabels: Record<string, string> = {
  paris: "Paris",
  marseille: "Marseille",
  lyon: "Lyon",
  toulouse: "Toulouse",
  nice: "Nice",
  nantes: "Nantes",
  strasbourg: "Strasbourg",
  montpellier: "Montpellier",
  bordeaux: "Bordeaux",
  lille: "Lille",
};

export async function generateStaticParams() {
  return cities.map((city) => ({
    city,
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ city: string }>;
}): Promise<Metadata> {
  const { city } = await params;
  const cityLabel = cityLabels[city];
  if (!cityLabel) return { title: "Ville non trouvée" };

  return {
    title: `Joueurs de football à ${cityLabel} | NFE`,
    description: `Découvrez les joueurs de football talentueux de ${cityLabel} et sa région. Vidéos, profils et actualités sur NFE.`,
    keywords: `football ${cityLabel}, joueurs ${cityLabel}, soccer ${cityLabel}, NFE, talents locaux`,
    openGraph: {
      title: `Joueurs de football à ${cityLabel}`,
      description: `Explorez la communauté football de ${cityLabel}`,
      type: "website",
    },
  };
}

export default async function PlayersByCityPage({
  params,
}: {
  params: Promise<{ city: string }>;
}) {
  const { city } = await params;
  const cityLabel = cityLabels[city];
  if (!cityLabel) {
    notFound();
  }

  const players = await prisma.user.findMany({
    where: {
      userType: "PLAYER",
      isOnboarded: true,
      localisation: {
        contains: cityLabel,
        mode: "insensitive",
      },
    },
    include: {
      posts: {
        where: {
          status: "PUBLISHED",
        },
        select: {
          id: true,
          title: true,
          _count: {
            select: {
              likes: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 3,
      },
      _count: {
        select: {
          followers: true,
          posts: {
            where: {
              status: "PUBLISHED",
            },
          },
        },
      },
    },
    orderBy: {
      followers: {
        _count: "desc",
      },
    },
    take: 30,
  });

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">
        Joueurs de football à {cityLabel}
      </h1>
      <p className="text-gray-600 mb-8">
        Découvrez les talents footballistiques de {cityLabel} et ses environs
      </p>

      {players.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">
            Aucun joueur de {cityLabel} n'est encore inscrit.
          </p>
          <Link
            href="/explore"
            className="text-blue-600 hover:text-blue-800 underline"
          >
            Explorer tous les joueurs
          </Link>
        </div>
      ) : (
        <>
          <div className="mb-6 text-sm text-gray-600">
            {players.length} joueur{players.length > 1 ? "s" : ""} trouvé
            {players.length > 1 ? "s" : ""} à {cityLabel}
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {players.map((player) => (
              <div
                key={player.id}
                className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow"
              >
                <Link href={`/user/${player.id}`}>
                  <div className="p-6">
                    <div className="flex items-start mb-4">
                      {player.image && (
                        <Image
                          src={player.image}
                          alt={player.name || "Joueur"}
                          width={60}
                          height={60}
                          className="rounded-full mr-4"
                        />
                      )}
                      <div className="flex-1">
                        <h2 className="text-xl font-semibold">
                          {player.fullName || player.name || "Joueur"}
                        </h2>
                        <p className="text-sm text-gray-500">
                          {player._count.followers} abonnés
                        </p>
                        {player.position && player.position.length > 0 && (
                          <p className="text-sm text-gray-600 mt-1">
                            {player.position.join(", ")}
                          </p>
                        )}
                      </div>
                    </div>
                    {player.biography && (
                      <p className="text-gray-600 line-clamp-3 mb-4">
                        {player.biography}
                      </p>
                    )}
                    <div className="flex justify-between items-center text-sm text-gray-500">
                      <span>📍 {player.localisation}</span>
                      <span>{player._count.posts} posts</span>
                    </div>
                  </div>
                </Link>

                {player.posts.length > 0 && (
                  <div className="border-t px-6 py-3 bg-gray-50">
                    <p className="text-xs font-semibold text-gray-700 mb-2">
                      Dernières vidéos
                    </p>
                    <div className="space-y-1">
                      {player.posts.map((post) => (
                        <Link
                          key={post.id}
                          href={`/post/${post.id}`}
                          className="block text-xs text-gray-600 hover:text-gray-900 truncate"
                        >
                          {post.title} ({post._count.likes} ❤️)
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <div className="mt-12 border-t pt-8">
        <h2 className="text-xl font-semibold mb-4">Autres villes populaires</h2>
        <div className="flex flex-wrap gap-2">
          {cities
            .filter((c) => c !== city)
            .map((city) => (
              <Link
                key={city}
                href={`/players/city/${city}`}
                className="px-4 py-2 bg-gray-100 rounded-full text-sm hover:bg-gray-200 transition-colors"
              >
                {cityLabels[city]}
              </Link>
            ))}
        </div>
      </div>
    </div>
  );
}
