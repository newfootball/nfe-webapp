import { useEffect, useRef, useState } from "react";
import { Button } from "../../../../../components/ui/button";
import { readPostMedia } from "../../lib/media";
import { postMediaPath } from "../../lib/media-contract";
import { mediaMessages } from "../../lib/media-messages";
import { unwrapMedia } from "../../lib/media-upload";
import type { Locale } from "../../lib/messages";

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
			switching = false,
			expiresAt = 0,
			renewalMargin = 20_000;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const element = video.current;
		const checkpoint = { position: 0, playing: false };
		const waits = new Set<() => void>();
		setStatus("idle");
		function waitFor(name: string, action: () => void) {
			return new Promise<void>((resolve, reject) => {
				if (!element) {
					reject(new Error("Unavailable"));
					return;
				}
				const cleanup = () => {
					clearTimeout(timeout);
					element.removeEventListener(name, ready);
					element.removeEventListener("error", failed);
					waits.delete(cancel);
				};
				const ready = () => {
					cleanup();
					resolve();
				};
				const failed = () => {
					cleanup();
					reject(new Error("Unavailable"));
				};
				const cancel = () => {
					cleanup();
					reject(new DOMException("Aborted", "AbortError"));
				};
				const timeout = setTimeout(failed, 20_000);
				waits.add(cancel);
				element.addEventListener(name, ready, { once: true });
				element.addEventListener("error", failed, { once: true });
				try {
					action();
				} catch {
					failed();
				}
			});
		}
		function record() {
			if (!element || switching || !element.readyState) return;
			checkpoint.position = element.currentTime;
			checkpoint.playing = !element.paused && !element.ended;
		}
		async function load(play = false) {
			if (!element || pending || !alive) return;
			pending = true;
			clearTimeout(timer);
			record();
			checkpoint.playing ||= play;
			setStatus("loading");
			try {
				const capability = unwrapMedia(
					await readPostMedia({ data: { postId, kind: "video" } }),
				);
				if (!alive) return;
				// Playback may have advanced or been paused during the authorized read.
				const requestedPlay = checkpoint.playing;
				record();
				checkpoint.playing ||= play || requestedPlay;
				expiresAt = capability.expiresAt;
				renewalMargin = Math.min(
					20_000,
					Math.max(500, (expiresAt - Date.now()) / 4),
				);
				switching = true;
				await waitFor("loadedmetadata", () => {
					element.src = capability.url;
					element.load();
				});
				if (!alive) return;
				const position = Math.min(
					checkpoint.position,
					Number.isFinite(element.duration)
						? element.duration
						: checkpoint.position,
				);
				if (position > 0)
					await waitFor("seeked", () => {
						element.currentTime = position;
					});
				if (checkpoint.playing)
					await element.play().catch(() => {
						checkpoint.playing = false;
					});
				if (!alive) return;
				switching = false;
				record();
				setStatus("ready");
				// A new source must finish metadata/seek restoration before another renewal.
				timer = setTimeout(
					() => {
						void load();
					},
					Math.max(500, expiresAt - Date.now() - renewalMargin),
				);
			} catch {
				if (alive) setStatus("error");
			} finally {
				pending = false;
				switching = false;
			}
		}
		const failed = () => {
			if (alive && !pending) {
				clearTimeout(timer);
				setStatus("error");
			}
		};
		const ensureFresh = () => {
			record();
			if (!switching && expiresAt && expiresAt - Date.now() < renewalMargin)
				void load();
		};
		window.addEventListener("focus", ensureFresh);
		element?.addEventListener("seeking", ensureFresh);
		element?.addEventListener("play", ensureFresh);
		element?.addEventListener("pause", record);
		element?.addEventListener("timeupdate", record);
		element?.addEventListener("error", failed);
		renew.current = (play) => {
			void load(play);
		};
		return () => {
			alive = false;
			clearTimeout(timer);
			renew.current = null;
			for (const cancel of waits) cancel();
			window.removeEventListener("focus", ensureFresh);
			if (element) {
				element.removeEventListener("seeking", ensureFresh);
				element.removeEventListener("play", ensureFresh);
				element.removeEventListener("pause", record);
				element.removeEventListener("timeupdate", record);
				element.removeEventListener("error", failed);
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
