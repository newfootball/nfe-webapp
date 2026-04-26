"use server";

import { v2 as cloudinary } from "cloudinary";
import { env } from "@/lib/env";

cloudinary.config({
	cloud_name: env.CLOUDINARY_CLOUD_NAME || "",
	api_key: env.CLOUDINARY_API_KEY || "",
	api_secret: env.CLOUDINARY_API_SECRET || "",
	secure: true,
});

export async function getUploadSignature(resourceType: "image" | "video") {
	const timestamp = Math.round(Date.now() / 1000);
	const folder = env.CLOUDINARY_FOLDER || "uploads";
	const paramsToSign = { timestamp, folder };

	const signature = cloudinary.utils.api_sign_request(
		paramsToSign,
		env.CLOUDINARY_API_SECRET || "",
	);

	return {
		signature,
		timestamp,
		cloudName: env.CLOUDINARY_CLOUD_NAME || "",
		apiKey: env.CLOUDINARY_API_KEY || "",
		folder,
		resourceType,
	};
}
