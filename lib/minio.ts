import { env } from "@/lib/env";
import * as Minio from "minio";

const minioClient = new Minio.Client({
	endPoint: env.MINIO_ENDPOINT,
	port: env.MINIO_PORT,
	useSSL: env.MINIO_USE_SSL === "true",
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

		// Vérifier si le bucket existe, sinon le créer
		const bucketExists = await minioClient.bucketExists(bucketName);

		if (!bucketExists) {
			await minioClient.makeBucket(bucketName);
		}

		// Uploader le fichier
		const result = await minioClient.putObject(
			bucketName,
			file.name,
			Buffer.from(await file.arrayBuffer()),
		);

		return result;
	} catch (error) {
		console.error("MinIO Upload Error:", error);
		return null;
	}
}
