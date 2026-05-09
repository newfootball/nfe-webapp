"use client";

import { ImagePlus, Play, Trash2, Upload, Video, X } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import {
	type DragEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface VideoUploaderProps {
	onVideoChange: (file: File | null) => void;
	onThumbnailChange: (file: File | null) => void;
	video: File | null;
	thumbnail: File | null;
	uploadProgress?: number;
	isUploading?: boolean;
}

function formatDuration(seconds: number): string {
	const m = Math.floor(seconds / 60);
	const s = Math.floor(seconds % 60);
	return `${m}:${s.toString().padStart(2, "0")}`;
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
	const [generatedThumbnails, setGeneratedThumbnails] = useState<string[]>([]);
	const [selectedThumbnailIndex, setSelectedThumbnailIndex] = useState<
		number | null
	>(null);
	const [showThumbnailOverride, setShowThumbnailOverride] = useState(false);
	const [videoDuration, setVideoDuration] = useState(0);
	const [isGeneratingThumbnails, setIsGeneratingThumbnails] = useState(false);

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

	const handleDragOver = useCallback((e: DragEvent<HTMLButtonElement>) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragOver(true);
	}, []);

	const handleDragLeave = useCallback((e: DragEvent<HTMLButtonElement>) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragOver(false);
	}, []);

	const handleDrop = useCallback(
		(e: DragEvent<HTMLButtonElement>) => {
			e.preventDefault();
			e.stopPropagation();
			setIsDragOver(false);
			const file = e.dataTransfer.files[0];
			if (file?.type.startsWith("video/")) {
				onVideoChange(file);
				setGeneratedThumbnails([]);
				setSelectedThumbnailIndex(null);
			}
		},
		[onVideoChange],
	);

	const handleVideoSelect = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			if (file) {
				onVideoChange(file);
				setGeneratedThumbnails([]);
				setSelectedThumbnailIndex(null);
				setShowThumbnailOverride(false);
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
				setShowThumbnailOverride(false);
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

		setIsGeneratingThumbnails(true);
		setVideoDuration(videoElement.duration);

		const thumbnails: string[] = [];
		const duration = videoElement.duration;
		const timestamps = [0.1, 0.25, 0.5, 0.75, 0.9].map((p) => p * duration);
		let index = 0;

		const captureFrame = () => {
			if (index >= timestamps.length) {
				setGeneratedThumbnails(thumbnails);
				setIsGeneratingThumbnails(false);
				// Auto-select the first frame as thumbnail
				if (thumbnails[0]) {
					fetch(thumbnails[0])
						.then((r) => r.blob())
						.then((blob) => {
							const file = new File([blob], "thumbnail-auto.jpg", {
								type: "image/jpeg",
							});
							onThumbnailChange(file);
							setSelectedThumbnailIndex(0);
						});
				}
				return;
			}
			const ts = timestamps[index];
			if (ts !== undefined) {
				videoElement.currentTime = ts;
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
	}, [video, onThumbnailChange]);

	const handleSelectGeneratedThumbnail = useCallback(
		async (dataUrl: string, index: number) => {
			const response = await fetch(dataUrl);
			const blob = await response.blob();
			const file = new File([blob], `thumbnail-${index}.jpg`, {
				type: "image/jpeg",
			});
			onThumbnailChange(file);
			setSelectedThumbnailIndex(index);
			setShowThumbnailOverride(false);
		},
		[onThumbnailChange],
	);

	const handleRemoveVideo = useCallback(() => {
		onVideoChange(null);
		onThumbnailChange(null);
		setGeneratedThumbnails([]);
		setSelectedThumbnailIndex(null);
		setShowThumbnailOverride(false);
		setVideoDuration(0);
		if (videoInputRef.current) videoInputRef.current.value = "";
	}, [onVideoChange, onThumbnailChange]);

	const handleRemoveThumbnail = useCallback(() => {
		onThumbnailChange(null);
		setSelectedThumbnailIndex(null);
		if (thumbnailInputRef.current) thumbnailInputRef.current.value = "";
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
		<div className="space-y-3">
			<canvas ref={canvasRef} className="hidden" />

			{!video ? (
				<button
					type="button"
					onDragOver={handleDragOver}
					onDragLeave={handleDragLeave}
					onDrop={handleDrop}
					onClick={() => videoInputRef.current?.click()}
					className={cn(
						"relative cursor-pointer rounded-xl border-2 border-dashed transition-all duration-200",
						"bg-muted/30 hover:bg-muted/50 hover:border-primary/60",
						"group w-full min-h-[160px] flex flex-col items-center justify-center gap-3 p-6",
						isDragOver
							? "border-primary bg-primary/5"
							: "border-muted-foreground/20",
					)}
				>
					<div
						className={cn(
							"rounded-xl p-3 transition-colors duration-200 bg-muted group-hover:bg-primary/10",
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
					<div className="text-center">
						<p className="text-foreground font-medium text-sm">
							{t("drag-drop-video")}
						</p>
						<p className="text-muted-foreground text-xs mt-0.5">
							{t("or-click-to-browse")}
						</p>
					</div>
					<div className="flex gap-1.5">
						{["MP4", "MOV", "WebM"].map((fmt) => (
							<span
								key={fmt}
								className="px-2 py-0.5 bg-background border border-border rounded-full text-[10px] font-medium text-muted-foreground"
							>
								{fmt}
							</span>
						))}
						<span className="px-2 py-0.5 bg-background border border-border rounded-full text-[10px] font-medium text-muted-foreground">
							100 Mo max
						</span>
					</div>
					<input
						ref={videoInputRef}
						type="file"
						accept="video/*"
						className="hidden"
						onChange={handleVideoSelect}
					/>
				</button>
			) : (
				<>
					{/* Video card */}
					<div className="rounded-xl overflow-hidden border border-border">
						{/* Video preview */}
						<div className="relative bg-black">
							{/* biome-ignore lint/a11y/useMediaCaption: Local upload preview has no caption track yet. */}
							<video
								ref={videoRef}
								src={videoUrl ?? undefined}
								className="w-full aspect-video object-contain"
								onLoadedMetadata={generateThumbnailsFromVideo}
								onPlay={() => setIsPlaying(true)}
								onPause={() => setIsPlaying(false)}
								onEnded={() => setIsPlaying(false)}
							/>

							{/* Play overlay */}
							<div className="absolute inset-0 flex items-center justify-center">
								<button
									type="button"
									onClick={togglePlay}
									className={cn(
										"rounded-full p-3.5 transition-all duration-300",
										"bg-black/40 hover:bg-black/60 backdrop-blur-sm hover:scale-110",
										isPlaying && "opacity-0 hover:opacity-100",
									)}
								>
									<Play
										className={cn("h-7 w-7 text-white", isPlaying && "hidden")}
										fill="white"
									/>
								</button>
							</div>

							{/* Duration badge */}
							{videoDuration > 0 && (
								<div className="absolute bottom-2 right-2 bg-black/70 text-white text-[10px] font-bold px-1.5 py-0.5 rounded font-mono">
									{formatDuration(videoDuration)}
								</div>
							)}

							{/* Remove button */}
							<button
								type="button"
								onClick={handleRemoveVideo}
								className="absolute top-2 right-2 rounded-full p-1.5 bg-destructive/80 hover:bg-destructive text-white transition-colors"
							>
								<X className="h-3.5 w-3.5" />
							</button>

							{/* Upload progress overlay */}
							{isUploading && (
								<div className="absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur-sm p-2.5">
									<div className="flex items-center gap-2">
										<Upload className="h-3.5 w-3.5 text-white animate-pulse shrink-0" />
										<div className="flex-1">
											<div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
												<div
													className="h-full bg-primary transition-all duration-300 rounded-full"
													style={{ width: `${uploadProgress}%` }}
												/>
											</div>
										</div>
										<span className="text-white text-xs font-bold tabular-nums">
											{uploadProgress}%
										</span>
									</div>
								</div>
							)}
						</div>

						{/* File row */}
						<div className="flex items-center gap-3 px-3 py-2.5 bg-card border-t border-border">
							<div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 shrink-0">
								<Video className="h-4 w-4 text-primary" />
							</div>
							<div className="flex-1 min-w-0">
								<p className="text-sm font-medium truncate">{video.name}</p>
								{isUploading && (
									<div className="mt-1 h-1 bg-muted rounded-full overflow-hidden">
										<div
											className="h-full bg-primary transition-all duration-300 rounded-full"
											style={{ width: `${uploadProgress}%` }}
										/>
									</div>
								)}
							</div>
							{isUploading && (
								<span className="text-primary text-xs font-bold tabular-nums shrink-0">
									{uploadProgress}%
								</span>
							)}
						</div>
					</div>

					{/* Thumbnail row */}
					<div className="flex items-center gap-3 p-2.5 rounded-xl border border-border bg-card">
						{/* Thumbnail preview */}
						<div className="relative w-14 aspect-video rounded-lg overflow-hidden border border-border shrink-0 bg-muted">
							{thumbnailUrl ? (
								<Image
									src={thumbnailUrl}
									alt={t("selected-thumbnail")}
									fill
									className="object-cover"
								/>
							) : (
								<div className="absolute inset-0 flex items-center justify-center">
									<div className="h-3 w-3 rounded-full border-2 border-muted-foreground/40 border-t-muted-foreground animate-spin" />
								</div>
							)}
						</div>

						<div className="flex-1 min-w-0">
							<p className="text-sm font-medium">{t("thumbnail")}</p>
							<p className="text-xs text-muted-foreground">
								{isGeneratingThumbnails
									? t("generating-thumbnails")
									: thumbnailUrl
										? t("auto-generated")
										: t("generating-thumbnails")}
							</p>
						</div>

						<div className="flex items-center gap-1.5 shrink-0">
							{thumbnail && (
								<button
									type="button"
									onClick={handleRemoveThumbnail}
									className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
								>
									<Trash2 className="h-3.5 w-3.5" />
								</button>
							)}
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => setShowThumbnailOverride((v) => !v)}
								className="h-7 px-2.5 text-xs"
							>
								{t("change")}
							</Button>
						</div>
					</div>

					{/* Thumbnail override panel */}
					{showThumbnailOverride && (
						<div className="space-y-2.5 p-3 rounded-xl border border-border bg-muted/30">
							<div className="flex items-center justify-between">
								<p className="text-xs text-muted-foreground font-medium">
									{t("select-from-video")}
								</p>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									onClick={() => thumbnailInputRef.current?.click()}
									className="h-7 gap-1.5 text-xs px-2"
								>
									<ImagePlus className="h-3.5 w-3.5" />
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

							{generatedThumbnails.length > 0 ? (
								<div className="grid grid-cols-5 gap-1.5">
									{generatedThumbnails.map((dataUrl, index) => (
										<button
											key={dataUrl}
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
							) : (
								<p className="text-xs text-muted-foreground text-center py-3">
									{t("generating-thumbnails")}
								</p>
							)}
						</div>
					)}
				</>
			)}
		</div>
	);
}
