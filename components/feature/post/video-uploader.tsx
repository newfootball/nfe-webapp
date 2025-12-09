"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ImagePlus, Play, Trash2, Upload, Video, X } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import {
	type DragEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

interface VideoUploaderProps {
	onVideoChange: (file: File | null) => void;
	onThumbnailChange: (file: File | null) => void;
	video: File | null;
	thumbnail: File | null;
	uploadProgress?: number;
	isUploading?: boolean;
}

export function VideoUploader({
	onVideoChange,
	onThumbnailChange,
	video,
	thumbnail,
	uploadProgress = 0,
	isUploading = false,
}: VideoUploaderProps) {
	const t = useTranslations("posts.new");
	const [isDragOver, setIsDragOver] = useState(false);
	const [isPlaying, setIsPlaying] = useState(false);
	const [showThumbnailOptions, setShowThumbnailOptions] = useState(false);
	const [generatedThumbnails, setGeneratedThumbnails] = useState<string[]>([]);
	const [selectedThumbnailIndex, setSelectedThumbnailIndex] = useState<
		number | null
	>(null);

	const videoInputRef = useRef<HTMLInputElement>(null);
	const thumbnailInputRef = useRef<HTMLInputElement>(null);
	const videoRef = useRef<HTMLVideoElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);

	const videoUrl = useMemo(
		() => (video ? URL.createObjectURL(video) : null),
		[video],
	);

	const thumbnailUrl = useMemo(
		() => (thumbnail ? URL.createObjectURL(thumbnail) : null),
		[thumbnail],
	);

	useEffect(() => {
		return () => {
			if (videoUrl) URL.revokeObjectURL(videoUrl);
			if (thumbnailUrl) URL.revokeObjectURL(thumbnailUrl);
			for (const url of generatedThumbnails) {
				URL.revokeObjectURL(url);
			}
		};
	}, [videoUrl, thumbnailUrl, generatedThumbnails]);

	const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragOver(true);
	}, []);

	const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragOver(false);
	}, []);

	const handleDrop = useCallback(
		(e: DragEvent<HTMLDivElement>) => {
			e.preventDefault();
			e.stopPropagation();
			setIsDragOver(false);

			const files = e.dataTransfer.files;
			const file = files[0];
			if (file && file.type.startsWith("video/")) {
				onVideoChange(file);
				setShowThumbnailOptions(true);
			}
		},
		[onVideoChange],
	);

	const handleVideoSelect = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			if (file) {
				onVideoChange(file);
				setShowThumbnailOptions(true);
				setGeneratedThumbnails([]);
				setSelectedThumbnailIndex(null);
			}
		},
		[onVideoChange],
	);

	const handleThumbnailSelect = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			if (file) {
				onThumbnailChange(file);
				setSelectedThumbnailIndex(null);
			}
		},
		[onThumbnailChange],
	);

	const generateThumbnailsFromVideo = useCallback(() => {
		if (!videoRef.current || !canvasRef.current || !video) return;

		const videoElement = videoRef.current;
		const canvas = canvasRef.current;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const thumbnails: string[] = [];
		const duration = videoElement.duration;
		const timestamps = [0.1, 0.25, 0.5, 0.75, 0.9].map((t) => t * duration);

		let index = 0;

		const captureFrame = () => {
			if (index >= timestamps.length) {
				setGeneratedThumbnails(thumbnails);
				return;
			}

			const timestamp = timestamps[index];
			if (timestamp !== undefined) {
				videoElement.currentTime = timestamp;
			}
		};

		videoElement.onseeked = () => {
			canvas.width = videoElement.videoWidth;
			canvas.height = videoElement.videoHeight;
			ctx.drawImage(videoElement, 0, 0);
			thumbnails.push(canvas.toDataURL("image/jpeg", 0.8));
			index++;
			captureFrame();
		};

		captureFrame();
	}, [video]);

	const handleSelectGeneratedThumbnail = useCallback(
		async (dataUrl: string, index: number) => {
			const response = await fetch(dataUrl);
			const blob = await response.blob();
			const file = new File([blob], `thumbnail-${index}.jpg`, {
				type: "image/jpeg",
			});
			onThumbnailChange(file);
			setSelectedThumbnailIndex(index);
		},
		[onThumbnailChange],
	);

	const handleRemoveVideo = useCallback(() => {
		onVideoChange(null);
		onThumbnailChange(null);
		setShowThumbnailOptions(false);
		setGeneratedThumbnails([]);
		setSelectedThumbnailIndex(null);
		if (videoInputRef.current) {
			videoInputRef.current.value = "";
		}
	}, [onVideoChange, onThumbnailChange]);

	const handleRemoveThumbnail = useCallback(() => {
		onThumbnailChange(null);
		setSelectedThumbnailIndex(null);
		if (thumbnailInputRef.current) {
			thumbnailInputRef.current.value = "";
		}
	}, [onThumbnailChange]);

	const togglePlay = useCallback(() => {
		if (!videoRef.current) return;
		if (isPlaying) {
			videoRef.current.pause();
		} else {
			videoRef.current.play();
		}
		setIsPlaying(!isPlaying);
	}, [isPlaying]);

	return (
		<div className="space-y-4">
			<canvas ref={canvasRef} className="hidden" />

			{!video ? (
				<div
					onDragOver={handleDragOver}
					onDragLeave={handleDragLeave}
					onDrop={handleDrop}
					onClick={() => videoInputRef.current?.click()}
					className={cn(
						"relative cursor-pointer rounded-xl border-2 border-dashed transition-all duration-200",
						"bg-muted/30 hover:bg-muted/50",
						"hover:border-primary/60",
						"group min-h-[180px] flex flex-col items-center justify-center p-6",
						isDragOver
							? "border-primary bg-primary/5"
							: "border-muted-foreground/20",
					)}
				>
					<div
						className={cn(
							"rounded-full p-3 mb-3 transition-colors duration-200",
							"bg-muted",
							"group-hover:bg-primary/10",
							isDragOver && "bg-primary/10",
						)}
					>
						<Video
							className={cn(
								"h-6 w-6 text-muted-foreground transition-colors duration-200",
								"group-hover:text-primary",
								isDragOver && "text-primary",
							)}
						/>
					</div>
					<p className="text-foreground font-medium text-sm text-center mb-0.5">
						{t("drag-drop-video")}
					</p>
					<p className="text-muted-foreground text-xs text-center">
						{t("or-click-to-browse")}
					</p>
					<p className="text-muted-foreground/50 text-xs mt-2">
						{t("supported-formats")}
					</p>
					<input
						ref={videoInputRef}
						type="file"
						accept="video/*"
						className="hidden"
						onChange={handleVideoSelect}
					/>
				</div>
			) : (
				<div className="space-y-4">
					<div className="relative rounded-xl overflow-hidden bg-black/95">
						<video
							ref={videoRef}
							src={videoUrl ?? undefined}
							className="w-full aspect-video object-contain"
							onLoadedMetadata={generateThumbnailsFromVideo}
							onPlay={() => setIsPlaying(true)}
							onPause={() => setIsPlaying(false)}
							onEnded={() => setIsPlaying(false)}
						/>

						<div className="absolute inset-0 flex items-center justify-center">
							<button
								type="button"
								onClick={togglePlay}
								className={cn(
									"rounded-full p-4 transition-all duration-300",
									"bg-black/40 hover:bg-black/60 backdrop-blur-sm",
									"hover:scale-110",
									isPlaying && "opacity-0 hover:opacity-100",
								)}
							>
								<Play
									className={cn("h-8 w-8 text-white", isPlaying && "hidden")}
									fill="white"
								/>
							</button>
						</div>

						<button
							type="button"
							onClick={handleRemoveVideo}
							className="absolute top-3 right-3 rounded-full p-2 bg-destructive/80 hover:bg-destructive text-white transition-colors"
						>
							<X className="h-4 w-4" />
						</button>

						{isUploading && (
							<div className="absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur-sm p-3">
								<div className="flex items-center gap-3">
									<Upload className="h-4 w-4 text-white animate-pulse" />
									<div className="flex-1">
										<div className="h-2 bg-white/20 rounded-full overflow-hidden">
											<div
												className="h-full bg-primary transition-all duration-300 rounded-full"
												style={{ width: `${uploadProgress}%` }}
											/>
										</div>
									</div>
									<span className="text-white text-sm font-medium">
										{uploadProgress}%
									</span>
								</div>
							</div>
						)}
					</div>

					{showThumbnailOptions && (
						<div className="space-y-3">
							<div className="flex items-center justify-between">
								<h4 className="text-sm font-medium">{t("cover-image")}</h4>
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => thumbnailInputRef.current?.click()}
									className="gap-2"
								>
									<ImagePlus className="h-4 w-4" />
									{t("upload-custom")}
								</Button>
								<input
									ref={thumbnailInputRef}
									type="file"
									accept="image/*"
									className="hidden"
									onChange={handleThumbnailSelect}
								/>
							</div>

							{thumbnail && (
								<div className="relative w-32 aspect-video rounded-lg overflow-hidden border-2 border-primary">
									<Image
										src={thumbnailUrl ?? ""}
										alt={t("selected-thumbnail")}
										fill
										className="object-cover"
									/>
									<button
										type="button"
										onClick={handleRemoveThumbnail}
										className="absolute top-1 right-1 rounded-full p-1 bg-destructive/80 hover:bg-destructive text-white transition-colors"
									>
										<Trash2 className="h-3 w-3" />
									</button>
								</div>
							)}

							{generatedThumbnails.length > 0 && !thumbnail && (
								<div className="space-y-2">
									<p className="text-xs text-muted-foreground">
										{t("select-from-video")}
									</p>
									<div className="grid grid-cols-5 gap-2">
										{generatedThumbnails.map((dataUrl, index) => (
											<button
												key={index}
												type="button"
												onClick={() =>
													handleSelectGeneratedThumbnail(dataUrl, index)
												}
												className={cn(
													"relative aspect-video rounded-lg overflow-hidden transition-all",
													"hover:ring-2 hover:ring-primary hover:scale-105",
													selectedThumbnailIndex === index &&
														"ring-2 ring-primary",
												)}
											>
												<Image
													src={dataUrl}
													alt={`${t("thumbnail")} ${index + 1}`}
													fill
													className="object-cover"
												/>
											</button>
										))}
									</div>
								</div>
							)}

							{generatedThumbnails.length === 0 && !thumbnail && (
								<p className="text-xs text-muted-foreground text-center py-4">
									{t("generating-thumbnails")}
								</p>
							)}
						</div>
					)}
				</div>
			)}
		</div>
	);
}
