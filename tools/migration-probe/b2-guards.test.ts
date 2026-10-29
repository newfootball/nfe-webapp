import { expect, test } from "bun:test";
import { allowedSignature } from "./b2-guards";

test("signer rejects other objects, uploads, parts and parameter injection", () => {
	const keys = new Set(["run/video", "run/multipart"]);
	const uploads = new Map([["run/multipart", "owned-upload"]]);
	const allow = (value: unknown) => allowedSignature(value, keys, uploads);
	expect(allow({ action: "get", key: "run/video" })).toBe(true);
	expect(
		allow({
			action: "part",
			key: "run/multipart",
			uploadId: "owned-upload",
			partNumber: 2,
		}),
	).toBe(true);
	for (const value of [
		null,
		{},
		{ action: "get", key: "other/video" },
		{ action: "delete", key: "run/video" },
		{ action: "get", key: "run/video", Bucket: "other" },
		{ action: "part", key: "run/multipart", uploadId: "other", partNumber: 1 },
		{
			action: "part",
			key: "run/video",
			uploadId: "owned-upload",
			partNumber: 1,
		},
		{
			action: "part",
			key: "run/multipart",
			uploadId: "owned-upload",
			partNumber: 3,
		},
	])
		expect(allow(value)).toBe(false);
});
