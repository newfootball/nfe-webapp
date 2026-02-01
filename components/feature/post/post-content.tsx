"use client";
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
		if (videoRef.current) {
			const videoElement = videoRef.current;

			const handleError = () => {
				console.error(t("video-playback-error"), videoElement.error);
				setCanPlayVideo(false);
			};

			if (video?.mimetype === "video/quicktime") {
				const canPlay = videoElement.canPlayType(video.mimetype);
				if (canPlay === "") {
					setCanPlayVideo(false);
				}
			}

			videoElement.addEventListener("error", handleError);

			return () => {
				videoElement.removeEventListener("error", handleError);
			};
		}
	}, [video, t]);

	if (!video) {
		return (
			<div className="relative aspect-video overflow-hidden rounded-lg">
				{image ? (
					<Image src={image?.url} alt={post.title} fill />
				) : (
					<div className="w-full h-full bg-gray-200" />
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

	const getSourceType = () => {
		if (video.mimetype === "video/quicktime") {
			return "video/mp4";
		}
		return video.mimetype;
	};

	return (
		<>
			<div className="relative aspect-video overflow-hidden rounded-lg">
				<div onClick={togglePlay} className="cursor-pointer">
					{canPlayVideo ? (
						<>
							<video
								ref={videoRef}
								muted={false}
								className="w-full h-full object-cover"
								poster={image?.url}
								controls={isPlaying}
								autoPlay={false}
								preload="metadata"
							>
								<source src={video.url} type={getSourceType()} />
								{video.mimetype === "video/quicktime" && (
									<source src={video.url} type="video/quicktime" />
								)}
								{t("video-unsupported")}
							</video>
							{!isPlaying && (
								<div className="absolute inset-0 flex items-center justify-center">
									<div className="bg-black bg-opacity-50 rounded-full p-3">
										<svg
											xmlns="http://www.w3.org/2000/svg"
											width="24"
											height="24"
											viewBox="0 0 24 24"
											fill="white"
										>
											<path d="M8 5v14l11-7z" />
										</svg>
									</div>
								</div>
							)}
						</>
					) : (
						// Fallback quand la vidéo ne peut pas être lue
						<div className="w-full h-full relative">
							{image ? (
								<Image
									src={image.url}
									alt={post.title}
									fill
									className="object-cover"
								/>
							) : (
								<div className="w-full h-full bg-gray-200 flex items-center justify-center">
									<div className="text-center p-4">
										<p className="text-red-500 font-medium">
											{t("video-unsupported")}
										</p>
										<p className="text-sm text-gray-600 mt-1">
											{t("video-unsupported-description", {
												format: video.mimetype,
											})}
										</p>
									</div>
								</div>
							)}
							<div className="absolute bottom-4 right-4 bg-red-500 text-white px-2 py-1 rounded-md text-xs">
								{t("video-unsupported")}
							</div>
						</div>
					)}
				</div>
			</div>
			<div>
				<h3 className="font-semibold pl-2">{post.title}</h3>
			</div>
		</>
	);
}
