"use client";
import type { PostWithUserAndMedias } from "@/src/query/post.query";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

interface PostContentProps {
	post: PostWithUserAndMedias;
}

export function PostContent({ post }: PostContentProps) {
	const image = post.medias.find((media) => media.mimetype.includes("image"));
	const video = post.medias.find((media) => media.mimetype.includes("video"));

	console.log(video);

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

	const [isPlaying, setIsPlaying] = useState(false);
	const [canPlayVideo, setCanPlayVideo] = useState(true);
	const videoRef = useRef<HTMLVideoElement>(null);

	// Vérifier si le navigateur peut lire le format vidéo
	useEffect(() => {
		if (videoRef.current) {
			const videoElement = videoRef.current;

			// Gestionnaire d'erreur pour les problèmes de lecture
			const handleError = () => {
				console.error("Erreur de lecture vidéo:", videoElement.error);
				setCanPlayVideo(false);
			};

			// Vérifier si le format est supporté
			if (video.mimetype === "video/quicktime") {
				// Test de compatibilité pour QuickTime
				const canPlay = videoElement.canPlayType(video.mimetype);
				// Si canPlay est vide (""), cela signifie que le format n'est pas supporté
				if (canPlay === "") {
					setCanPlayVideo(false);
				}
			}

			videoElement.addEventListener("error", handleError);

			return () => {
				videoElement.removeEventListener("error", handleError);
			};
		}
	}, [video.mimetype]);

	const togglePlay = () => {
		if (videoRef.current && canPlayVideo) {
			if (isPlaying) {
				videoRef.current.pause();
			} else {
				videoRef.current.play().catch((error) => {
					console.error("Échec de lecture:", error);
					setCanPlayVideo(false);
				});
			}
			setIsPlaying(!isPlaying);
		}
	};

	// Détermine le type MIME adapté pour la source
	const getSourceType = () => {
		// Pour QuickTime, on peut essayer avec video/mp4 comme type alternatif
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
								{/* Essayer avec un type alternatif si c'est QuickTime */}
								{video.mimetype === "video/quicktime" && (
									<source src={video.url} type="video/quicktime" />
								)}
								Votre navigateur ne prend pas en charge la lecture de cette
								vidéo.
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
											Format vidéo non pris en charge
										</p>
										<p className="text-sm text-gray-600 mt-1">
											Le format {video.mimetype} n'est pas compatible avec votre
											navigateur
										</p>
									</div>
								</div>
							)}
							<div className="absolute bottom-4 right-4 bg-red-500 text-white px-2 py-1 rounded-md text-xs">
								Vidéo non lisible
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
