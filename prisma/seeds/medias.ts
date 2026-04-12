import { faker } from "@faker-js/faker/locale/fr";
import type { Media, Prisma, PrismaClient } from "@prisma/client";
import { randomizer } from "../../src/lib/array";

export const seedMedias = async ({
	prisma,
	posts,
}: {
	prisma: PrismaClient;
	posts: Prisma.PostUncheckedCreateInput[];
}) => {
	const medias: Media[] = [];

	for (const post of posts) {
		if (!post.id) continue;

		const data = {
			postId: post.id,
			mimetype: "video/mp4",
			filename: Math.random().toString(36).substring(2, 15),
			label: faker.word.words(),
			createdAt: faker.date.past(),
		};

		const { video, image } = randomVideo();

		const dbVideo = await prisma.media.create({
			data: {
				...data,
				url: video,
				mimetype: "video/mp4",
				metadata: {
					video: { duration: Math.floor(Math.random() * 120) + 15 },
				},
			},
		});

		const dbImage = await prisma.media.create({
			data: {
				...data,
				url: image,
				mimetype: "image/jpeg",
				metadata: { image: { width: 1280, height: 720 } },
			},
		});

		medias.push(dbVideo, dbImage);
	}

	return medias;
};

const FOOTBALL_VIDEOS = [
	"https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
	"https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
	"https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
	"https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
	"https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackOnStreetAndDirt.mp4",
	"https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4",
	"https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/VolkswagenGTIReview.mp4",
	"https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4",
];

const FOOTBALL_THUMBNAILS = [
	"https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=1280&h=720&fit=crop",
	"https://images.unsplash.com/photo-1552667466-07770ae110d0?w=1280&h=720&fit=crop",
	"https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=1280&h=720&fit=crop",
	"https://images.unsplash.com/photo-1504305754058-2f08ccd89a0a?w=1280&h=720&fit=crop",
	"https://images.unsplash.com/photo-1459865264687-595d652de67e?w=1280&h=720&fit=crop",
	"https://images.unsplash.com/photo-1551958219-acbc595b8b7a?w=1280&h=720&fit=crop",
	"https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?w=1280&h=720&fit=crop",
	"https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=1280&h=720&fit=crop",
	"https://images.unsplash.com/photo-1560272564-c83b66b1ad12?w=1280&h=720&fit=crop",
	"https://images.unsplash.com/photo-1606925797300-0b35e9d1794e?w=1280&h=720&fit=crop",
	"https://images.unsplash.com/photo-1517466787929-bc90951d0974?w=1280&h=720&fit=crop",
	"https://images.unsplash.com/photo-1543326727-cf6c39e8f84c?w=1280&h=720&fit=crop",
];

const randomVideo = (): { video: string; image: string } => {
	return {
		video: randomizer(FOOTBALL_VIDEOS) as string,
		image: randomizer(FOOTBALL_THUMBNAILS) as string,
	};
};
