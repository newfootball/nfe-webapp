"use client";

import { VideoUploader } from "@/components/feature/post/video-uploader";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Post } from "@prisma/client";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import type { PostData } from "./post.schema";
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

	const handleSavePost = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setIsLoading(true);
		setError(null);

		if (!selectedVideo) {
			setError(t("video-required"));
			setIsLoading(false);
			return;
		}

		const data = {
			title,
			description,
			image: selectedThumbnail,
			video: selectedVideo,
		} as PostData;

		savePost(data)
			.then((post: Post) => {
				toast.success(t("post-created-successfully"));
				router.push(`/post/${post.id}`);
			})
			.catch((error) => {
				setError(error.message);
				toast.error(error.message);
			})
			.finally(() => {
				setIsLoading(false);
			});
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
					uploadProgress={isLoading ? 50 : 0}
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
							{t("publishing")}
						</>
					) : (
						t("submit")
					)}
				</Button>
			</form>
		</main>
	);
}
