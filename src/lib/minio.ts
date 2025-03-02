import { env } from "@/lib/env";
import * as Minio from "minio";

// Extract hostname from the endpoint URL
const getEndpointDetails = (url: string) => {
	try {
		const urlObj = new URL(url);
		return {
			endPoint: urlObj.hostname,
			port: urlObj.port ? Number.parseInt(urlObj.port) : 443,
			useSSL: urlObj.protocol === "https:",
		};
	} catch (error) {
		console.error("Invalid MinIO endpoint URL:", error);
		throw new Error("Invalid MinIO endpoint configuration");
	}
};

const endpointDetails = getEndpointDetails(env.MINIO_ENDPOINT);

const minioClient = new Minio.Client({
	endPoint: endpointDetails.endPoint,
	port: endpointDetails.port,
	useSSL: endpointDetails.useSSL,
	accessKey: env.MINIO_ACCESS_KEY,
	secretKey: env.MINIO_SECRET_KEY,
});

export interface UploadedObjectInfo {
	etag: string;
	versionId: string | null;
}

export async function uploadToMinio(
	file: File,
): Promise<UploadedObjectInfo | null> {
	try {
		const bucketName = env.MINIO_BUCKET_NAME;

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
