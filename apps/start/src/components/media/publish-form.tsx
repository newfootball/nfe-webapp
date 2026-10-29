import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "../../../../../components/ui/button";
import { publishPost } from "../../lib/media";
import { PublishPostSchema } from "../../lib/media-contract";
import { mediaError, mediaMessages } from "../../lib/media-messages";
import {
	FRAME_FRACTIONS,
	imageToWebp,
	videoFrames,
} from "../../lib/media-thumbnails";
import { unwrapMedia } from "../../lib/media-upload";
import type { Locale } from "../../lib/messages";
import { TransferStatus } from "./transfer-status";
import { useIdentityGuard, useObjectUrl, useTransfer } from "./use-transfer";

const inputClass =
	"w-full rounded-lg border bg-background px-3 py-3 text-foreground focus-visible:outline-2 focus-visible:outline-ring";
export function PublishForm({
	viewerId,
	locale,
}: {
	viewerId: string;
	locale: Locale;
}) {
	const identity = useIdentityGuard(viewerId);
	return identity.active ? (
		<>
			{identity.error && (
				<p role="alert">{mediaError(locale, identity.error)}</p>
			)}
			<Publication key={viewerId} locale={locale} verify={identity.verify} />
		</>
	) : (
		<p role="alert">{mediaMessages[locale].identity}</p>
	);
}
function FrameChoice({
	file,
	index,
	checked,
	onChange,
	locale,
}: {
	file: File;
	index: number;
	checked: boolean;
	onChange: () => void;
	locale: Locale;
}) {
	const url = useObjectUrl(file),
		t = mediaMessages[locale];
	return (
		<label
			className={`relative cursor-pointer overflow-hidden rounded-lg border-2 p-1 focus-within:ring-2 focus-within:ring-ring ${checked ? "border-primary" : "border-transparent"}`}
		>
			<input
				type="radio"
				name="cover-frame"
				checked={checked}
				onChange={onChange}
				className="sr-only"
			/>
			<img
				src={url || undefined}
				alt={`${t.frame} ${(FRAME_FRACTIONS[index] ?? 0) * 100}%`}
				className="aspect-video w-full rounded object-contain bg-muted"
			/>
			<span className="block py-1 text-center text-xs">
				{(FRAME_FRACTIONS[index] ?? 0) * 100}%
				{checked ? ` · ${t.selected}` : ""}
			</span>
		</label>
	);
}
function Publication({
	locale,
	verify,
}: {
	locale: Locale;
	verify: () => Promise<boolean>;
}) {
	const t = mediaMessages[locale],
		router = useRouter(),
		queryClient = useQueryClient();
	const [video, setVideo] = useState<File | null>(null),
		[thumbnail, setThumbnail] = useState<File | null>(null);
	const [frames, setFrames] = useState<File[]>([]),
		[preparing, setPreparing] = useState(false),
		[error, setError] = useState("");
	const [changing, setChanging] = useState(false);
	const title = useRef<HTMLInputElement>(null),
		description = useRef<HTMLTextAreaElement>(null);
	const request = useRef<{ signature: string; id: string } | null>(null);
	const videoUpload = useTransfer(video, "video"),
		coverUpload = useTransfer(thumbnail, "thumbnail");
	const videoUrl = useObjectUrl(video),
		coverUrl = useObjectUrl(thumbnail);
	const generation = useRef(0),
		mounted = useRef(true);
	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
			generation.current++;
		};
	}, []);
	useEffect(() => {
		const controller = new AbortController();
		setFrames([]);
		setThumbnail(null);
		if (!video) return;
		setPreparing(true);
		videoFrames(video, controller.signal)
			.then((choices) => {
				if (!controller.signal.aborted) {
					setFrames(choices);
					setThumbnail(choices[0] ?? null);
				}
			})
			.catch(() => {
				if (!controller.signal.aborted) setError(t.errors.invalid);
			})
			.finally(() => {
				if (!controller.signal.aborted) setPreparing(false);
			});
		return () => controller.abort();
	}, [video, t.errors.invalid]);
	const publication = useMutation({
		mutationFn: async () => {
			if (!(await verify())) throw new Error("unavailable");
			if (
				videoUpload.snapshot.phase !== "ready" ||
				coverUpload.snapshot.phase !== "ready"
			)
				throw new Error("invalid");
			const fields = {
				title: title.current?.value.trim() ?? "",
				description: description.current?.value.trim() ?? "",
				videoId: videoUpload.snapshot.assetId,
				thumbnailId: coverUpload.snapshot.assetId,
			};
			const signature = JSON.stringify(fields);
			if (request.current?.signature !== signature)
				request.current = { signature, id: crypto.randomUUID() };
			const parsed = PublishPostSchema.safeParse({
				...fields,
				requestId: request.current.id,
			});
			if (!parsed.success) throw new Error("invalid");
			return unwrapMedia(await publishPost({ data: parsed.data }));
		},
		onSuccess: async (post) => {
			if (!mounted.current || !(await verify())) return;
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: ["feed"] }),
				queryClient.invalidateQueries({ queryKey: ["explore"] }),
				queryClient.invalidateQueries({ queryKey: ["profile"] }),
			]);
			await router.invalidate();
			await router.navigate({
				to: "/$locale/post/$id",
				params: { locale, id: post.id },
			});
		},
		onError: (error) => setError(mediaError(locale, error.message)),
	});
	const busy = publication.isPending || changing;
	async function changeCover(file: File) {
		const version = ++generation.current;
		setChanging(true);
		setError("");
		try {
			await coverUpload.cancel();
			if (mounted.current && version === generation.current) setThumbnail(file);
		} catch {
			if (mounted.current) setError(t.errors.unavailable);
		} finally {
			if (mounted.current) setChanging(false);
		}
	}
	async function cancel(kind: "video" | "thumbnail") {
		setChanging(true);
		setError("");
		try {
			if (!(await verify())) return;
			if (kind === "video") {
				await videoUpload.cancel();
				await coverUpload.cancel();
				setVideo(null);
				setThumbnail(null);
				setFrames([]);
			} else {
				await coverUpload.cancel();
				setThumbnail(null);
			}
		} catch {
			setError(t.errors.unavailable);
		} finally {
			setChanging(false);
		}
	}
	return (
		<section className="flex flex-col gap-8">
			<header className="border-l-4 border-primary pl-5">
				<p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
					{t.eyebrow}
				</p>
				<h1 className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">
					{t.publish}
				</h1>
				<p className="mt-3 text-muted-foreground">{t.intro}</p>
			</header>
			<form
				className="grid gap-8 md:grid-cols-[1.35fr_1fr]"
				onSubmit={(event) => {
					event.preventDefault();
					setError("");
					publication.mutate();
				}}
			>
				<div className="flex min-w-0 flex-col gap-6">
					<fieldset
						disabled={busy}
						className="flex min-w-0 flex-col gap-4 rounded-2xl border bg-card p-5"
					>
						<legend className="px-2 text-lg font-bold">01 · {t.video}</legend>
						<label className="flex flex-col gap-2 text-sm">
							{t.choose}
							<input
								aria-describedby="media-format"
								type="file"
								accept="video/mp4,.mp4"
								disabled={Boolean(video)}
								className={inputClass}
								onChange={(event) => {
									const file = event.target.files?.[0];
									if (file) {
										setError("");
										setVideo(file);
										event.currentTarget.value = "";
									}
								}}
							/>
						</label>
						<p
							id="media-format"
							className="text-xs leading-relaxed text-muted-foreground"
						>
							{t.format}
						</p>
						{videoUrl && (
							<video
								controls
								playsInline
								preload="metadata"
								src={videoUrl}
								className="aspect-video w-full rounded-lg bg-muted"
								aria-label={t.video}
							>
								<track kind="captions" />
							</video>
						)}
						{video && (
							<>
								<p className="truncate text-sm">{video.name}</p>
								<TransferStatus
									locale={locale}
									snapshot={videoUpload.snapshot}
									onPause={videoUpload.pause}
									onResume={() => {
										void verify().then((ok) => {
											if (ok) void videoUpload.start();
										});
									}}
									onCancel={() => {
										void cancel("video");
									}}
								/>
							</>
						)}
					</fieldset>
					<fieldset
						disabled={busy || preparing}
						className="flex min-w-0 flex-col gap-4 rounded-2xl border bg-card p-5"
					>
						<legend className="px-2 text-lg font-bold">
							02 · {t.thumbnail}
						</legend>
						{preparing && <p role="status">{t.preparing}</p>}
						{frames.length > 0 && (
							<fieldset className="min-w-0">
								<legend className="mb-3 text-sm text-muted-foreground">
									{t.frames}
								</legend>
								<div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
									{frames.map((file, index) => (
										<FrameChoice
											key={file.name}
											file={file}
											index={index}
											checked={thumbnail === file}
											locale={locale}
											onChange={() => {
												void changeCover(file);
											}}
										/>
									))}
								</div>
							</fieldset>
						)}
						<label className="flex flex-col gap-2 text-sm">
							{t.manual}
							<input
								type="file"
								accept="image/*"
								className={inputClass}
								onChange={async (event) => {
									const file = event.target.files?.[0];
									if (!file) return;
									const version = ++generation.current;
									setChanging(true);
									try {
										const converted = await imageToWebp(file);
										if (mounted.current && generation.current === version)
											await changeCover(converted);
									} catch {
										if (mounted.current) setError(t.errors.invalid);
									} finally {
										if (mounted.current) setChanging(false);
									}
									event.target.value = "";
								}}
							/>
						</label>
						{coverUrl && (
							<img
								src={coverUrl}
								alt={t.thumbnail}
								className="max-h-56 w-full rounded-lg bg-muted object-contain"
							/>
						)}
						{thumbnail && (
							<TransferStatus
								locale={locale}
								snapshot={coverUpload.snapshot}
								onPause={coverUpload.pause}
								onResume={() => {
									void verify().then((ok) => {
										if (ok) void coverUpload.start();
									});
								}}
								onCancel={() => {
									void cancel("thumbnail");
								}}
							/>
						)}
					</fieldset>
				</div>
				<fieldset
					disabled={busy}
					className="flex min-w-0 flex-col gap-5 self-start rounded-2xl border bg-card p-5"
				>
					<legend className="px-2 text-lg font-bold">
						03 · {t.description}
					</legend>
					<label className="flex flex-col gap-2 text-sm font-medium">
						{t.type}
						<input className={inputClass} value={t.videoType} readOnly />
					</label>
					<label className="flex flex-col gap-2 text-sm font-medium">
						{t.title}
						<input
							ref={title}
							className={inputClass}
							name="title"
							required
							maxLength={200}
						/>
					</label>
					<label className="flex flex-col gap-2 text-sm font-medium">
						{t.description}
						<textarea
							ref={description}
							className={inputClass}
							name="description"
							rows={6}
							maxLength={10_000}
						/>
					</label>
					{error && (
						<p role="alert" className="text-sm text-destructive">
							{error}
						</p>
					)}
					<Button
						size="lg"
						type="submit"
						disabled={
							busy ||
							videoUpload.snapshot.phase !== "ready" ||
							coverUpload.snapshot.phase !== "ready"
						}
					>
						{publication.isPending ? t.publishing : t.submit}
					</Button>
				</fieldset>
			</form>
		</section>
	);
}
