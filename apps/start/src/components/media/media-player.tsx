import { type ReactNode, useEffect, useRef, useState } from "react";
import { readPostMedia } from "../../lib/media";
import { postMediaPath } from "../../lib/media-contract";
import { mediaMessages } from "../../lib/media-messages";
import { unwrapMedia } from "../../lib/media-upload";
import type { Locale } from "../../lib/messages";
import { Button } from "../ui/button";

class ExpiredMediaCapability extends Error {}

export function MediaPlayer({
	postId,
	locale,
	title,
	bleed = false,
	onPlaying,
	children,
}: {
	postId: string;
	locale: Locale;
	title: string;
	// Edge-to-edge broadcast frame with an overlaid play control.
	bleed?: boolean;
	// Fired once per mount, on the first frame actually played.
	onPlaying?: () => void;
	children?: ReactNode;
}) {
	const t = mediaMessages[locale],
		video = useRef<HTMLVideoElement>(null),
		played = useRef(onPlaying);
	played.current = onPlaying;
	// biome-ignore lint/correctness/useExhaustiveDependencies: re-armed for each post on the same element.
	useEffect(() => {
		const element = video.current;
		if (!element) return;
		const once = () => played.current?.();
		element.addEventListener("playing", once, { once: true });
		return () => element.removeEventListener("playing", once);
	}, [postId]);
	const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
		"idle",
	);
	const renew = useRef<((play?: boolean) => void) | null>(null);
	useEffect(() => {
		let alive = true,
			pending = false,
			switching = false,
			expiredRetries = 0,
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
					clearTimeout(expiry);
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
				// Native browsers can silently retry an expired Range URL without
				// emitting a media error. Do not leave renewal blocked on seeked.
				const expiry =
					name === "seeked"
						? setTimeout(
								() => {
									cleanup();
									reject(new ExpiredMediaCapability());
								},
								Math.max(0, expiresAt - Date.now()),
							)
						: undefined;
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
		async function load(play = false, retryExpired = false) {
			if (!element || pending || !alive) return;
			if (!retryExpired) expiredRetries = 0;
			let retry = false;
			pending = true;
			clearTimeout(timer);
			if (!retryExpired) record();
			checkpoint.playing ||= play;
			setStatus("loading");
			try {
				const capability = unwrapMedia(
					await readPostMedia({ data: { postId, kind: "video" } }),
				);
				if (!alive) return;
				// Playback may have advanced or been paused during the authorized read.
				const requestedPlay = checkpoint.playing;
				if (!retryExpired) record();
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
				expiredRetries = 0;
				record();
				setStatus("ready");
				// A new source must finish metadata/seek restoration before another renewal.
				timer = setTimeout(
					() => {
						void load();
					},
					Math.max(500, expiresAt - Date.now() - renewalMargin),
				);
			} catch (error) {
				if (
					alive &&
					error instanceof ExpiredMediaCapability &&
					expiredRetries < 2
				) {
					expiredRetries++;
					retry = true;
				} else if (alive) setStatus("error");
			} finally {
				pending = false;
				switching = false;
				if (retry && alive) void load(false, true);
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
		<figure className={bleed ? "flex flex-col" : "flex flex-col gap-3"}>
			<div className="relative">
				<video
					ref={video}
					controls={!bleed || status !== "idle"}
					playsInline
					preload={status === "idle" ? "none" : "auto"}
					poster={postMediaPath(postId, "thumbnail")}
					aria-label={title}
					className={
						bleed
							? "block aspect-video w-full bg-pitch object-cover"
							: "aspect-video w-full rounded-lg bg-muted"
					}
				>
					<track kind="captions" />
				</video>
				{children}
				{bleed && status === "idle" && (
					<button
						type="button"
						aria-label={t.play}
						onClick={() => renew.current?.(true)}
						className="group absolute top-1/2 left-1/2 grid size-13 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/85 transition duration-300 hover:scale-105 hover:border-primary hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-primary"
					>
						<span className="ml-1 border-y-8 border-l-[13px] border-y-transparent border-l-white transition-colors group-hover:border-l-primary-foreground" />
					</button>
				)}
			</div>
			{!bleed && status === "idle" && (
				<Button
					type="button"
					variant="secondary"
					onClick={() => renew.current?.(true)}
				>
					{t.play}
				</Button>
			)}
			{status === "loading" && (
				<p
					role="status"
					className={
						bleed
							? "px-4 pt-2 text-xs text-muted-foreground sm:px-0"
							: "text-sm text-muted-foreground"
					}
				>
					{t.loading}
				</p>
			)}
			{status === "error" && (
				<figcaption
					role="alert"
					className={`flex flex-wrap items-center gap-3 text-sm${bleed ? " px-4 pt-2 sm:px-0" : ""}`}
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
