import { useEffect, useRef, useState } from "react";
import { Button } from "../../../../../components/ui/button";
import { readPostMedia } from "../../lib/media";
import { postMediaPath } from "../../lib/media-contract";
import { mediaMessages } from "../../lib/media-messages";
import { unwrapMedia } from "../../lib/media-upload";
import type { Locale } from "../../lib/messages";

function restorePlayback(
	element: HTMLVideoElement,
	position: number,
	playing: boolean,
) {
	element.currentTime = Math.min(
		position,
		Number.isFinite(element.duration) ? element.duration : position,
	);
	if (playing)
		void element.play().catch(() => {
			/* Native controls remain available if autoplay is restricted. */
		});
}
export function MediaPlayer({
	postId,
	locale,
	title,
}: {
	postId: string;
	locale: Locale;
	title: string;
}) {
	const t = mediaMessages[locale],
		video = useRef<HTMLVideoElement>(null);
	const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
		"idle",
	);
	const renew = useRef<((play?: boolean) => void) | null>(null);
	useEffect(() => {
		let alive = true,
			pending = false,
			expiresAt = 0,
			timer: ReturnType<typeof setTimeout> | undefined;
		let restore: (() => void) | undefined;
		const element = video.current;
		setStatus("idle");
		function preparePlayback(element: HTMLVideoElement, play: boolean) {
			if (restore) element.removeEventListener("loadedmetadata", restore);
			const position = element.currentTime,
				playing = play || (!element.paused && !element.ended);
			return () => {
				if (!alive) return;
				restorePlayback(element, position, playing);
				setStatus("ready");
			};
		}
		async function load(play = false) {
			if (!element || pending || !alive) return;
			pending = true;
			clearTimeout(timer);
			setStatus("loading");
			try {
				const capability = unwrapMedia(
					await readPostMedia({ data: { postId, kind: "video" } }),
				);
				if (!alive) return;
				restore = preparePlayback(element, play);
				expiresAt = capability.expiresAt;
				element.addEventListener("loadedmetadata", restore, { once: true });
				element.src = capability.url;
				element.load();
				timer = setTimeout(
					() => {
						void load();
					},
					Math.max(1000, capability.expiresAt - Date.now() - 20_000),
				);
			} catch {
				if (alive) setStatus("error");
			} finally {
				pending = false;
			}
		}
		const failed = () => {
			if (alive) {
				clearTimeout(timer);
				setStatus("error");
			}
		};
		const ensureFresh = () => {
			if (expiresAt && expiresAt - Date.now() < 20_000) void load();
		};
		window.addEventListener("focus", ensureFresh);
		element?.addEventListener("seeking", ensureFresh);
		element?.addEventListener("play", ensureFresh);
		element?.addEventListener("error", failed);
		renew.current = (play) => {
			void load(play);
		};
		return () => {
			alive = false;
			clearTimeout(timer);
			renew.current = null;
			window.removeEventListener("focus", ensureFresh);
			if (element) {
				element.removeEventListener("seeking", ensureFresh);
				element.removeEventListener("play", ensureFresh);
				element.removeEventListener("error", failed);
				if (restore) element.removeEventListener("loadedmetadata", restore);
				element.pause();
				element.removeAttribute("src");
				element.load();
			}
		};
	}, [postId]);
	return (
		<figure className="flex flex-col gap-3">
			<video
				ref={video}
				controls
				playsInline
				preload="none"
				poster={postMediaPath(postId, "thumbnail")}
				aria-label={title}
				className="aspect-video w-full rounded-lg bg-muted"
			>
				<track kind="captions" />
			</video>
			{status === "idle" && (
				<Button
					type="button"
					variant="secondary"
					onClick={() => renew.current?.(true)}
				>
					{t.play}
				</Button>
			)}
			{status === "loading" && (
				<p role="status" className="text-sm text-muted-foreground">
					{t.loading}
				</p>
			)}
			{status === "error" && (
				<figcaption
					role="alert"
					className="flex flex-wrap items-center gap-3 text-sm"
				>
					<span>{t.playbackError}</span>
					<Button
						type="button"
						variant="outline"
						onClick={() => renew.current?.()}
					>
						{t.retry}
					</Button>
				</figcaption>
			)}
		</figure>
	);
}
