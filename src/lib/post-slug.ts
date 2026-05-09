const DEFAULT_MAX_SLUG_ATTEMPTS = 20;

export function slugifyPostTitle(value: string) {
	const slug = value
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");

	return slug || "post";
}

export async function createUniquePostSlug(
	title: string,
	slugExists: (slug: string) => Promise<boolean>,
	maxAttempts = DEFAULT_MAX_SLUG_ATTEMPTS,
) {
	const baseSlug = slugifyPostTitle(title);

	for (let suffix = 0; suffix < maxAttempts; suffix++) {
		const slug = suffix === 0 ? baseSlug : `${baseSlug}-${suffix.toString()}`;

		if (!(await slugExists(slug))) {
			return slug;
		}
	}

	return `${baseSlug}-${crypto.randomUUID().slice(0, 8)}`;
}
