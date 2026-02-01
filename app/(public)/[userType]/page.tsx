import type { UserType } from "@prisma/client";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

const userTypeMapping: Record<string, UserType> = {
	players: "PLAYER",
	coaches: "COACH",
	recruiters: "RECRUITER",
	clubs: "CLUB",
};

const userTypeLabels: Record<UserType, { singular: string; plural: string }> = {
	USER: { singular: "Utilisateur", plural: "Utilisateurs" },
	PLAYER: { singular: "Joueur", plural: "Joueurs" },
	COACH: { singular: "Entraîneur", plural: "Entraîneurs" },
	RECRUITER: { singular: "Recruteur", plural: "Recruteurs" },
	CLUB: { singular: "Club", plural: "Clubs" },
};

export async function generateStaticParams() {
	return Object.keys(userTypeMapping).map((userType) => ({
		userType,
	}));
}

export async function generateMetadata({
	params,
}: {
	params: Promise<{ userType: string }>;
}): Promise<Metadata> {
	const { userType } = await params;
	const type = userTypeMapping[userType];
	if (!type) return { title: "Page non trouvée" };

	const label = userTypeLabels[type].plural;
	return {
		title: `${label} de football | NFE`,
		description: `Découvrez les ${label.toLowerCase()} sur Next Football Experience. Connectez-vous avec la communauté du football.`,
		keywords: `${label}, football, soccer, NFE, réseau social football`,
		openGraph: {
			title: `${label} sur NFE`,
			description: `Explorez les profils des ${label.toLowerCase()} de notre communauté`,
			type: "website",
		},
	};
}

export default async function UsersByTypePage({
	params,
}: {
	params: Promise<{ userType: string }>;
}) {
	const { userType } = await params;
	const userTypeEnum = userTypeMapping[userType];
	if (!userTypeEnum) {
		notFound();
	}

	const users = await prisma.user.findMany({
		where: {
			userType: userTypeEnum,
			isOnboarded: true,
		},
		include: {
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

	const label = userTypeLabels[userTypeEnum];

	return (
		<div className="container mx-auto px-4 py-8">
			<h1 className="text-3xl font-bold mb-6">{label.plural}</h1>
			<p className="text-gray-600 mb-8">
				Connectez-vous avec les {label.plural.toLowerCase()} de notre communauté
			</p>

			{users.length === 0 ? (
				<p className="text-center text-gray-500 py-12">
					Aucun {label.singular.toLowerCase()} n'a encore rejoint la plateforme.
				</p>
			) : (
				<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
					{users.map((user) => (
						<Link
							key={user.id}
							href={`/user/${user.id}`}
							className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow p-6"
						>
							<div className="flex flex-col items-center text-center">
								{user.image && (
									<Image
										src={user.image}
										alt={user.name || label.singular}
										width={80}
										height={80}
										className="rounded-full mb-4"
									/>
								)}
								<h2 className="text-lg font-semibold mb-1">
									{user.fullName || user.name || `${label.singular} anonyme`}
								</h2>
								<p className="text-sm text-gray-500 mb-3">
									{user._count.followers} abonnés
								</p>
								{user.localisation && (
									<p className="text-sm text-gray-600 mb-2">
										📍 {user.localisation}
									</p>
								)}
								{user.biography && (
									<p className="text-sm text-gray-600 line-clamp-3">
										{user.biography}
									</p>
								)}
								<div className="mt-4 text-xs text-gray-500">
									{user._count.posts} posts publiés
								</div>
							</div>
						</Link>
					))}
				</div>
			)}
		</div>
	);
}
