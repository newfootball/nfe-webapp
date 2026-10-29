export const BUCKET = "nfe-webapp-dev";
export const REGION = "eu-central-003";
export const ENDPOINT = "https://s3.eu-central-003.backblazeb2.com";

export function assert(condition: unknown, code: string): asserts condition {
	if (!condition) throw new Error(code);
}

export function allowedSignature(
	value: unknown,
	keys: Set<string>,
	uploads: Map<string, string>,
): value is {
	action: "put" | "get" | "head" | "part";
	key: string;
	uploadId?: string;
	partNumber?: number;
} {
	if (!value || typeof value !== "object") return false;
	const v = value as Record<string, unknown>;
	if (typeof v.key !== "string" || !keys.has(v.key)) return false;
	if (
		Object.keys(v).some(
			(key) => !["action", "key", "uploadId", "partNumber"].includes(key),
		)
	)
		return false;
	if (v.action === "part")
		return (
			typeof v.uploadId === "string" &&
			uploads.get(v.key) === v.uploadId &&
			(v.partNumber === 1 || v.partNumber === 2)
		);
	return (
		["put", "get", "head"].includes(String(v.action)) &&
		v.uploadId === undefined &&
		v.partNumber === undefined
	);
}
