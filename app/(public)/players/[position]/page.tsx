import type { Position } from "@prisma/client";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

const positionMapping: Record<string, Position> = {
	goalkeeper: "GOALKEEPER",
	"centre-back": "CENTRE_BACK",
	"right-back": "RIGHT_BACK",
	"left-back": "LEFT_BACK",
	"defensive-midfielder": "DEFENSIVE_MIDFIELDER",
	"centre-midfielder": "CENTRE_MIDFIELDER",
	"attacking-midfielder": "ATTACKING_MIDFIELDER",
	"right-winger": "RIGHT_WINGER",
	"left-winger": "LEFT_WINGER",
	"centre-forward": "CENTRE_FORWARD",
	striker: "STRIKER",
};

const positionLabels: Record<Position, string> = {
	GOALKEEPER: "Gardien de but",
	CENTRE_BACK: "Défenseur central",
	RIGHT_BACK: "Arrière droit",
	LEFT_BACK: "Arrière gauche",
	DEFENSIVE_MIDFIELDER: "Milieu défensif",
	CENTRE_MIDFIELDER: "Milieu central",
	ATTACKING_MIDFIELDER: "Milieu offensif",
	RIGHT_WINGER: "Ailier droit",
	LEFT_WINGER: "Ailier gauche",
	CENTRE_FORWARD: "Avant-centre",
	STRIKER: "Attaquant",
};

export async function generateStaticParams() {
	return Object.keys(positionMapping).map((position) => ({
		position,
	}));
}

export async function generateMetadata({
	params,
}: {
	params: Promise<{ position: string }>;
}): Promise<Metadata> {
	const { position: positionParam } = await params;
	const position = positionMapping[positionParam];
	if (!position) return { title: "Position non trouvée" };

	const label = positionLabels[position];
	return {
		title: `${label}s - Joueurs de football | NFE`,
		description: `Découvrez les meilleurs ${label.toLowerCase()}s sur Next Football Experience. Vidéos, highlights et profils de joueurs professionnels et amateurs.`,
		keywords: `${label}, football, soccer, joueurs, ${positionParam}, vidéos football, NFE`,
		openGraph: {
			title: `${label}s sur NFE`,
			description: `Explorez les profils et vidéos des ${label.toLowerCase()}s`,
			type: "website",
		},
	};
}

export default async function PlayersByPositionPage({
	params,
}: {
	params: Promise<{ position: string }>;
}) {
	const { position: positionParam } = await params;
	const position = positionMapping[positionParam];
	if (!position) {
		notFound();
	}

	const players = await prisma.user.findMany({
		where: {
			position: {
				has: position,
			},
			isOnboarded: true,
			userType: "PLAYER",
		},
		include: {
			posts: {
				where: {
					status: "PUBLISHED",
				},
				include: {
					medias: true,
					user: true,
					_count: {
						select: {
							likes: true,
							comments: true,
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
			createdAt: "desc",
		},
		take: 20,
	});

	const label = positionLabels[position];

	return (
		<div className="container mx-auto px-4 py-8">
			<h1 className="text-3xl font-bold mb-6">{label}s</h1>
			<p className="text-gray-600 mb-8">
				Découvrez les {label.toLowerCase()}s talentueux de notre communauté
			</p>

			{players.length === 0 ? (
				<p className="text-center text-gray-500 py-12">
					Aucun {label.toLowerCase()} n'a encore rejoint la plateforme.
				</p>
			) : (
				<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
					{players.map((player) => (
						<div
							key={player.id}
							className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow"
						>
							<Link href={`/user/${player.id}`}>
								<div className="p-6">
									<div className="flex items-center mb-4">
										{player.image && (
											<Image
												src={player.image}
												alt={player.name || "Joueur"}
												width={60}
												height={60}
												className="rounded-full mr-4"
											/>
										)}
										<div>
											<h2 className="text-xl font-semibold">
												{player.fullName || player.name || "Joueur anonyme"}
											</h2>
											<p className="text-sm text-gray-500">
												{player._count.followers} abonnés •{" "}
												{player._count.posts} posts
											</p>
										</div>
									</div>
									{player.biography && (
										<p className="text-gray-600 line-clamp-2 mb-4">
											{player.biography}
										</p>
									)}
									{player.localisation && (
										<p className="text-sm text-gray-500">
											📍 {player.localisation}
										</p>
									)}
								</div>
							</Link>

							{player.posts.length > 0 && (
								<div className="border-t px-6 py-4">
									<h3 className="text-sm font-semibold mb-2">
										Dernières vidéos
									</h3>
									<div className="space-y-2">
										{player.posts.slice(0, 2).map((post) => (
											<Link
												key={post.id}
												href={`/post/${post.id}`}
												className="block text-sm text-gray-600 hover:text-gray-900"
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
			)}
		</div>
	);
}
