import { env } from "@/lib/env";
import { type UploadApiResponse, v2 as cloudinary } from "cloudinary";

// Configuration de Cloudinary
cloudinary.config({
	cloud_name: env.CLOUDINARY_CLOUD_NAME || "",
	api_key: env.CLOUDINARY_API_KEY || "",
	api_secret: env.CLOUDINARY_API_SECRET || "",
	secure: true,
});

export interface UploadedMediaInfo {
	public_id: string;
	url: string;
	secure_url: string;
	resource_type: string;
	format: string;
	width?: number;
	height?: number;
	duration?: number;
}

// Définition d'un type pour les transformations Cloudinary
type CloudinaryTransformation = {
	width?: number;
	height?: number;
	crop?: string;
	aspect_ratio?: string;
	gravity?: string;
	zoom?: string | number;
	x?: number;
	y?: number;
	fetch_format?: string;
	quality?: string | number;
	radius?: string | number;
	angle?: number;
	effect?: string;
	opacity?: number;
	border?: string;
	background?: string;
	overlay?: string;
	underlay?: string;
	default_image?: string;
	delay?: string | number;
	color?: string;
	color_space?: string;
	dpr?: string | number;
	page?: string | number;
	density?: number;
	flags?: string | string[];
	transformation?: string;
	[key: string]: unknown; // Pour les options supplémentaires que nous n'avons pas explicitement listées
};

/**
 * Télécharge un fichier vers Cloudinary
 * @param file Fichier à télécharger
 * @param options Options supplémentaires (dossier, transformation, etc.)
 * @returns Informations sur le média téléchargé ou null en cas d'erreur
 */
export async function uploadToCloudinary(
	file: File,
	options: {
		folder?: string;
		resource_type?: "image" | "video" | "auto";
		transformation?: CloudinaryTransformation[];
	} = {},
): Promise<UploadedMediaInfo | null> {
	try {
		// Conversion du fichier en un format que Cloudinary peut utiliser
		const buffer = Buffer.from(await file.arrayBuffer());

		// Détermine automatiquement le type de ressource si non spécifié
		const resourceType =
			options.resource_type ||
			(file.type.startsWith("image/")
				? "image"
				: file.type.startsWith("video/")
					? "video"
					: "auto");

		const uploadOptions = {
			folder: options.folder || env.CLOUDINARY_FOLDER || "uploads",
			resource_type: resourceType,
			public_id: Math.random().toString(36).substring(2, 15),
			transformation: options.transformation || [],
		};

		const base64Data = buffer.toString("base64");
		const dataURI = `data:${file.type};base64,${base64Data}`;

		// Upload vers Cloudinary
		const result = await new Promise<UploadApiResponse>((resolve, reject) => {
			cloudinary.uploader.upload(
				dataURI,
				uploadOptions,
				(error: Error | undefined, result?: UploadApiResponse) => {
					if (error || !result)
						reject(error || new Error("Résultat d'upload manquant"));
					else resolve(result);
				},
			);
		});

		return {
			public_id: result.public_id,
			url: result.url,
			secure_url: result.secure_url,
			resource_type: result.resource_type,
			format: result.format,
			width: result.width,
			height: result.height,
			duration: result.duration,
		};
	} catch (error) {
		console.error("Erreur Cloudinary:", error);
		return null;
	}
}

/**
 * Génère une URL optimisée pour un média Cloudinary
 * @param publicId Identifiant public du média sur Cloudinary
 * @param options Options de transformation
 * @returns URL optimisée
 */
export function getOptimizedUrl(
	publicId: string,
	options: {
		resourceType?: "image" | "video";
		transformation?: CloudinaryTransformation[];
		format?: string;
	} = {},
): string {
	const transformationArray = options.transformation || [];
	const resourceType = options.resourceType || "image";
	const format = options.format || "auto";

	return cloudinary.url(publicId, {
		resource_type: resourceType,
		transformation: transformationArray,
		format: format,
		quality: "auto",
		fetch_format: "auto",
	});
}

/**
 * Supprime un média de Cloudinary
 * @param publicId Identifiant public du média
 * @returns Succès ou échec de la suppression
 */
export async function deleteFromCloudinary(
	publicId: string,
	resourceType: "image" | "video" = "image",
): Promise<boolean> {
	try {
		interface DestroyResult {
			result: string;
		}

		const result = await new Promise<DestroyResult>((resolve, reject) => {
			cloudinary.uploader.destroy(
				publicId,
				{ resource_type: resourceType },
				(error: Error | undefined, result?: DestroyResult) => {
					if (error || !result)
						reject(error || new Error("Résultat de suppression manquant"));
					else resolve(result);
				},
			);
		});

		return result.result === "ok";
	} catch (error) {
		console.error("Erreur lors de la suppression:", error);
		return false;
	}
}

/**
 * Exemple d'utilisation:
 *
 * // Upload d'une image
 * async function handleImageUpload(file: File) {
 *   const result = await uploadToCloudinary(file, {
 *     folder: "profils",
 *     transformation: [
 *       { width: 800, crop: "scale" }
 *     ]
 *   });
 *
 *   if (result) {
 *     // Stocker result.public_id en base de données pour référence future
 *     // Utiliser result.secure_url pour afficher l'image
 *     return result.secure_url;
 *   }
 *   return null;
 * }
 *
 * // Upload d'une vidéo
 * async function handleVideoUpload(file: File) {
 *   const result = await uploadToCloudinary(file, {
 *     resource_type: "video",
 *     folder: "videos"
 *   });
 *
 *   if (result) {
 *     return result.secure_url;
 *   }
 *   return null;
 * }
 *
 * // Générer une URL optimisée
 * function getResponsiveImage(publicId: string) {
 *   return getOptimizedUrl(publicId, {
 *     transformation: [
 *       { width: "auto", dpr: "auto", crop: "scale", quality: "auto" }
 *     ]
 *   });
 * }
 *
 * // Supprimer un média
 * async function removeMedia(publicId: string, isVideo: boolean) {
 *   return await deleteFromCloudinary(publicId, isVideo ? "video" : "image");
 * }
 */
