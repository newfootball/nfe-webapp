export const POST_PUBLIC_USER_SELECT = {
	id: true,
	name: true,
	image: true,
	localisation: true,
} as const;

export const POST_WITH_PUBLIC_USER_INCLUDE = {
	user: {
		select: POST_PUBLIC_USER_SELECT,
	},
	medias: true,
	_count: {
		select: {
			comments: true,
			likes: true,
		},
	},
} as const;
