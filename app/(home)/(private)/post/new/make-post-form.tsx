"use client";

import type { Post } from "@prisma/client";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { VideoUploader } from "@/components/feature/post/video-uploader";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { uploadToCloudinaryDirect } from "@/src/lib/cloudinary-client-upload";
import { getUploadSignature } from "./get-upload-signature.action";
import { savePost } from "./save-post.action";

export default function MakePostForm() {
	const t = useTranslations("posts.new");
	const router = useRouter();

	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [selectedVideo, setSelectedVideo] = useState<File | null>(null);
	const [selectedThumbnail, setSelectedThumbnail] = useState<File | null>(null);
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [uploadProgress, setUploadProgress] = useState(0);

	const handleSavePost = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setIsLoading(true);
		setError(null);
		setUploadProgress(0);

		if (!selectedVideo) {
			setError(t("video-required"));
			setIsLoading(false);
			return;
		}

		try {
			const [videoSig, imageSig] = await Promise.all([
				getUploadSignature("video"),
				selectedThumbnail ? getUploadSignature("image") : Promise.resolve(null),
			]);

			const videoResult = await uploadToCloudinaryDirect(
				selectedVideo,
				videoSig,
				(pct) =>
					setUploadProgress(Math.round(pct * (selectedThumbnail ? 0.85 : 1))),
			);

			let imageResult = null;
			if (selectedThumbnail && imageSig) {
				imageResult = await uploadToCloudinaryDirect(
					selectedThumbnail,
					imageSig,
					(pct) => setUploadProgress(85 + Math.round(pct * 0.15)),
				);
			}

			setUploadProgress(100);

			const post: Post = await savePost({
				title,
				description,
				videoPublicId: videoResult.public_id,
				videoUrl: videoResult.secure_url,
				videoMimeType: selectedVideo.type,
				videoMetadata: {
					width: videoResult.width,
					height: videoResult.height,
					format: videoResult.format,
					resource_type: videoResult.resource_type,
					public_id: videoResult.public_id,
					duration: videoResult.duration,
				},
				imagePublicId: imageResult?.public_id ?? null,
				imageUrl: imageResult?.secure_url ?? null,
				imageMimeType: selectedThumbnail?.type ?? null,
				imageMetadata: imageResult
					? {
							width: imageResult.width,
							height: imageResult.height,
							format: imageResult.format,
							resource_type: imageResult.resource_type,
							public_id: imageResult.public_id,
						}
					: null,
			});

			toast.success(t("post-created-successfully"));
			router.push(`/post/${post.id}`);
		} catch (err) {
			const message = err instanceof Error ? err.message : t("video-required");
			setError(message);
			toast.error(message);
		} finally {
			setIsLoading(false);
		}
	};

	const isFormValid = title.trim() && description.trim() && selectedVideo;

	return (
		<main className="container max-w-lg mx-auto p-4 space-y-6 mt-20 md:mt-4 pb-24">
			<form onSubmit={handleSavePost} className="space-y-6">
				{error && (
					<Alert variant="destructive">
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}

				<div className="space-y-4">
					<Input
						type="text"
						placeholder={t("add-a-title")}
						className="text-lg font-semibold border-0 border-b rounded-none px-0 focus-visible:ring-0 focus-visible:border-primary placeholder:text-muted-foreground"
						value={title}
						onChange={(e) => setTitle(e.target.value)}
					/>

					<Textarea
						placeholder={t("write-a-description")}
						className="min-h-[100px] resize-none border-0 border-b rounded-none px-0 focus-visible:ring-0 focus-visible:border-primary placeholder:text-muted-foreground"
						value={description}
						onChange={(e) => setDescription(e.target.value)}
					/>
				</div>

				<VideoUploader
					video={selectedVideo}
					thumbnail={selectedThumbnail}
					onVideoChange={setSelectedVideo}
					onThumbnailChange={setSelectedThumbnail}
					isUploading={isLoading}
					uploadProgress={uploadProgress}
				/>

				<Button
					type="submit"
					className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
					size="lg"
					disabled={isLoading || !isFormValid}
				>
					{isLoading ? (
						<>
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							{uploadProgress < 100 ? `${uploadProgress}%` : t("publishing")}
						</>
					) : (
						t("submit")
					)}
				</Button>
			</form>
		</main>
	);
}
