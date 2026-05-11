"use client";
import { Play } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { toCloudinaryWebP } from "@/src/lib/cloudinary";
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
	const [aspectRatio, setAspectRatio] = useState("16/9");
	const videoRef = useRef<HTMLVideoElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);

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

	useEffect(() => {
		const container = containerRef.current;
		const el = videoRef.current;
		if (!container || !el) return;

		const observer = new IntersectionObserver(
			(entries) => {
				if (!entries[0]?.isIntersecting) {
					el.pause();
					setIsPlaying(false);
				}
			},
			{ threshold: 0.25 },
		);

		observer.observe(container);
		return () => observer.disconnect();
	}, []);

	const handleLoadedMetadata = () => {
		const el = videoRef.current;
		if (el?.videoWidth && el?.videoHeight) {
			setAspectRatio(`${el.videoWidth}/${el.videoHeight}`);
		}
	};

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

	const transformedVideoUrl = (() => {
		if (
			video.url.includes("cloudinary.com") &&
			video.url.includes("/upload/")
		) {
			return video.url.replace("/upload/", "/upload/f_mp4/");
		}
		return null;
	})();

	return (
		<div
			ref={containerRef}
			className="relative w-full overflow-hidden"
			style={{ aspectRatio }}
		>
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
							className="w-full h-full object-contain"
							poster={toCloudinaryWebP(image?.url)}
							controls={isPlaying}
							autoPlay={false}
							preload="metadata"
							onLoadedMetadata={handleLoadedMetadata}
						>
							{transformedVideoUrl && (
								<source src={transformedVideoUrl} type="video/mp4" />
							)}
							<source src={video.url} />
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
