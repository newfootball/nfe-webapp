"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { VideoUploader } from "@/components/feature/post/video-uploader";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Post } from "@/src/generated/prisma/client";
import { uploadToCloudinaryDirect } from "@/src/lib/cloudinary-client-upload";
import { getUploadSignature } from "./get-upload-signature.action";
import { savePost } from "./save-post.action";

type CloudinaryUploadResult = Awaited<
	ReturnType<typeof uploadToCloudinaryDirect>
>;

async function uploadPostMedia({
	video,
	thumbnail,
	onProgress,
}: {
	video: File;
	thumbnail: File | null;
	onProgress: (progress: number) => void;
}) {
	const [videoSig, imageSig] = await Promise.all([
		getUploadSignature("video"),
		thumbnail ? getUploadSignature("image") : Promise.resolve(null),
	]);

	const videoResult = await uploadToCloudinaryDirect(video, videoSig, (pct) =>
		onProgress(Math.round(pct * (thumbnail ? 0.85 : 1))),
	);

	const imageResult =
		thumbnail && imageSig
			? await uploadToCloudinaryDirect(thumbnail, imageSig, (pct) =>
					onProgress(85 + Math.round(pct * 0.15)),
				)
			: null;

	onProgress(100);

	return { videoResult, imageResult };
}

function createMediaMetadata(result: CloudinaryUploadResult) {
	return {
		width: result.width,
		height: result.height,
		format: result.format,
		resource_type: result.resource_type,
		public_id: result.public_id,
	};
}

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

	const handleSavePost = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setError(null);
		setUploadProgress(0);

		if (!selectedVideo) {
			setError(t("video-required"));
			return;
		}

		setIsLoading(true);

		try {
			const { videoResult, imageResult } = await uploadPostMedia({
				video: selectedVideo,
				thumbnail: selectedThumbnail,
				onProgress: setUploadProgress,
			});

			const post: Post = await savePost({
				title,
				description,
				videoPublicId: videoResult.public_id,
				videoUrl: videoResult.secure_url,
				videoMimeType: selectedVideo.type,
				videoMetadata: {
					...createMediaMetadata(videoResult),
					duration: videoResult.duration,
				},
				imagePublicId: imageResult?.public_id ?? null,
				imageUrl: imageResult?.secure_url ?? null,
				imageMimeType: selectedThumbnail?.type ?? null,
				imageMetadata: imageResult ? createMediaMetadata(imageResult) : null,
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

				<VideoUploader
					video={selectedVideo}
					thumbnail={selectedThumbnail}
					onVideoChange={setSelectedVideo}
					onThumbnailChange={setSelectedThumbnail}
					isUploading={isLoading}
					uploadProgress={uploadProgress}
				/>

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
