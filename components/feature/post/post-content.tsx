"use client";
import { Play } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import type { PostWithUserAndMedias } from "@/src/types/post.types";

interface PostContentProps {
	post: PostWithUserAndMedias;
}

export function PostContent({ post }: PostContentProps) {
	const t = useTranslations("posts.post-content");
	const image = post.medias.find((media) => media.mimetype.includes("image"));
	const video = post.medias.find((media) => media.mimetype.includes("video"));
	const [isPlaying, setIsPlaying] = useState(false);
	const [canPlayVideo, setCanPlayVideo] = useState(true);
	const videoRef = useRef<HTMLVideoElement>(null);

	useEffect(() => {
		const el = videoRef.current;
		if (!el) return;

		const handleError = () => {
			console.error(t("video-playback-error"), el.error);
			setCanPlayVideo(false);
		};

		el.addEventListener("error", handleError);

		return () => {
			el.removeEventListener("error", handleError);
		};
	}, [t]);

	if (!video) {
		return (
			<div className="relative aspect-video w-full overflow-hidden">
				{image ? (
					<Image
						src={image?.url}
						alt={post.title}
						fill
						className="object-cover"
					/>
				) : (
					<div className="w-full h-full bg-muted" />
				)}
			</div>
		);
	}

	const togglePlay = () => {
		if (videoRef.current && canPlayVideo) {
			if (isPlaying) {
				videoRef.current.pause();
			} else {
				videoRef.current.play().catch((error) => {
					console.error(t("video-playback-error"), error);
					setCanPlayVideo(false);
				});
			}
			setIsPlaying(!isPlaying);
		}
	};

	const getVideoUrl = () => {
		if (
			video.url.includes("cloudinary.com") &&
			video.url.includes("/upload/")
		) {
			return video.url.replace("/upload/", "/upload/f_mp4,vc_auto/");
		}
		return video.url;
	};

	return (
		<div className="relative aspect-video w-full overflow-hidden">
			<button
				type="button"
				aria-label={isPlaying ? t("pause-video") : t("play-video")}
				onClick={togglePlay}
				className="cursor-pointer w-full h-full border-0 bg-transparent p-0 text-left"
			>
				{canPlayVideo ? (
					<>
						<video
							ref={videoRef}
							muted={false}
							loop
							className="w-full h-full object-cover"
							poster={image?.url}
							controls={isPlaying}
							autoPlay={false}
							preload="metadata"
						>
							<source src={getVideoUrl()} type="video/mp4" />
							{t("video-unsupported")}
						</video>
						{!isPlaying && (
							<div className="absolute inset-0 flex items-center justify-center">
								<div className="bg-black/50 rounded-full p-3">
									<Play className="h-6 w-6 text-white" fill="white" />
								</div>
							</div>
						)}
					</>
				) : (
					<div className="w-full h-full relative">
						{image ? (
							<Image
								src={image.url}
								alt={post.title}
								fill
								className="object-cover"
							/>
						) : (
							<div className="w-full h-full bg-muted flex items-center justify-center">
								<div className="text-center p-4">
									<p className="text-destructive font-medium">
										{t("video-unsupported")}
									</p>
									<p className="text-sm text-muted-foreground mt-1">
										{t("video-unsupported-description", {
											format: video.mimetype,
										})}
									</p>
								</div>
							</div>
						)}
						<div className="absolute bottom-4 right-4 bg-destructive text-destructive-foreground px-2 py-1 rounded-md text-xs">
							{t("video-unsupported")}
						</div>
					</div>
				)}
			</button>
		</div>
	);
}
