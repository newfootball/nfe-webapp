// Pure additive manifest; safe for cross-package contract tests.
export const profileV2Version = "v2-club-profile";
export const profileV2Definition = {
	private_profiles: {
		clubSize: { type: "integer", required: false },
		clubPosition: { type: "string", size: 255, required: false },
	},
};
export const profileV2Digest = new Bun.CryptoHasher("sha256")
	.update(JSON.stringify(profileV2Definition))
	.digest("hex");
