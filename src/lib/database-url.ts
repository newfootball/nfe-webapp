export function expandEnvReferences(value: string) {
	return value.replace(/\$\{([A-Z0-9_]+)\}/g, (_match, key: string) => {
		const replacement = process.env[key];

		if (!replacement) {
			throw new Error(
				`Missing environment variable referenced by DATABASE_URL: ${key}`,
			);
		}

		return replacement;
	});
}

export function getDatabaseUrl() {
	const databaseUrl = process.env.DATABASE_URL;

	if (!databaseUrl) {
		throw new Error("DATABASE_URL is required");
	}

	return expandEnvReferences(databaseUrl);
}
