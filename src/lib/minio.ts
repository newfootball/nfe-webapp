import { env } from "@/lib/env";
import * as Minio from "minio";

// Extract hostname from the endpoint URL
const getEndpointDetails = (url: string | undefined) => {
	// Default values if URL is not provided
	if (!url) {
		console.warn("MinIO endpoint URL not provided, using default configuration");
		return {
			endPoint: "localhost",
			port: 9000,
			useSSL: false,
		};
	}

	try {
		const urlObj = new URL(url);
		return {
			endPoint: urlObj.hostname,
			port: urlObj.port ? Number.parseInt(urlObj.port) : urlObj.protocol === "https:" ? 443 : 80,
			useSSL: urlObj.protocol === "https:",
		};
	} catch (error) {
		console.error("Invalid MinIO endpoint URL:", error);
		console.warn("Using default MinIO configuration");
		return {
			endPoint: "localhost",
			port: 9000,
			useSSL: false,
		};
	}
};

// Get endpoint details safely
const endpointDetails = getEndpointDetails(env.MINIO_ENDPOINT);

// Create MinIO client with safe defaults for missing values
const minioClient = new Minio.Client({
	endPoint: endpointDetails.endPoint,
	port: endpointDetails.port,
	useSSL: endpointDetails.useSSL,
	accessKey: env.MINIO_ACCESS_KEY || "minioadmin",
	secretKey: env.MINIO_SECRET_KEY || "minioadmin",
});

export interface UploadedObjectInfo {
	etag: string;
	versionId: string | null;
}

export async function uploadToMinio(
	file: File,
): Promise<UploadedObjectInfo | null> {
	try {
		const bucketName = env.MINIO_BUCKET_NAME || "uploads";

		if (!bucketName) {
			throw new Error("MinIO bucket name is not configured");
		}

		// Vérifier si le bucket existe, sinon le créer
		try {
			const bucketExists = await minioClient.bucketExists(bucketName);

			if (!bucketExists) {
				await minioClient.makeBucket(bucketName);
				console.log(`Created new bucket: ${bucketName}`);
			}
		} catch (bucketError) {
			console.error("Error checking/creating bucket:", bucketError);
			throw new Error(
				`Failed to access or create bucket: ${(bucketError as Error).message}`,
			);
		}

		// Uploader le fichier
		try {
			const result = await minioClient.putObject(
				bucketName,
				file.name,
				Buffer.from(await file.arrayBuffer()),
			);

			console.log(
				`Successfully uploaded file: ${file.name} to bucket: ${bucketName}`,
			);
			return result;
		} catch (uploadError) {
			console.error("Error uploading file:", uploadError);
			throw new Error(
				`Failed to upload file: ${(uploadError as Error).message}`,
			);
		}
	} catch (error) {
		console.error("MinIO Upload Error:", error);
		return null;
	}
}
