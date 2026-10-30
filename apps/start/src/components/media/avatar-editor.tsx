import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "../../../../../components/ui/button";
import { replaceAvatar } from "../../lib/media";
import { canonicalImage } from "../../lib/media-contract";
import { mediaError, mediaMessages } from "../../lib/media-messages";
import { imageToWebp } from "../../lib/media-thumbnails";
import { unwrapMedia } from "../../lib/media-upload";
import type { Locale } from "../../lib/messages";
import { TransferStatus } from "./transfer-status";
import { useIdentityGuard, useObjectUrl, useTransfer } from "./use-transfer";
export function AvatarEditor({
	viewerId,
	locale,
	image,
}: {
	viewerId: string;
	locale: Locale;
	image: string | null;
}) {
	const identity = useIdentityGuard(viewerId);
	return identity.active ? (
		<>
			{identity.error && (
				<p role="alert">{mediaError(locale, identity.error)}</p>
			)}
			<Editor
				key={viewerId}
				locale={locale}
				image={image}
				verify={identity.verify}
			/>
		</>
	) : (
		<p role="alert">{mediaMessages[locale].identity}</p>
	);
}
function Editor({
	locale,
	verify,
	image,
}: {
	locale: Locale;
	image: string | null;
	verify: () => Promise<boolean>;
}) {
	const t = mediaMessages[locale],
		queryClient = useQueryClient(),
		router = useRouter();
	const [file, setFile] = useState<File | null>(null),
		[currentImage, setCurrentImage] = useState(image),
		[error, setError] = useState(""),
		[preparing, setPreparing] = useState(false),
		[saved, setSaved] = useState(false);
	const alive = useRef(true),
		transfer = useTransfer(file, "avatar"),
		url = useObjectUrl(file);
	useEffect(() => {
		setCurrentImage(image);
	}, [image]);
	useEffect(() => {
		alive.current = true;
		return () => {
			alive.current = false;
		};
	}, []);
	const replacement = useMutation({
		mutationFn: async () => {
			if (!(await verify())) throw new Error("unavailable");
			const assetId = transfer.snapshot.assetId;
			if (!assetId || transfer.snapshot.phase !== "ready")
				throw new Error("invalid");
			return unwrapMedia(await replaceAvatar({ data: { assetId } }));
		},
		onSuccess: async ({ image: committedImage }) => {
			if (!(await verify())) return;
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: ["profile"] }),
				queryClient.invalidateQueries({ queryKey: ["feed"] }),
				queryClient.invalidateQueries({ queryKey: ["explore"] }),
			]);
			await router.invalidate();
			if (alive.current) {
				// Loader invalidation can commit its new props after this callback.
				// Show the exact canonical descriptor acknowledged by the mutation.
				setCurrentImage(committedImage);
				setFile(null);
				setSaved(true);
			}
		},
		onError: (cause) => {
			if (alive.current) setError(mediaError(locale, cause.message));
		},
	});
	return (
		<section
			className="flex flex-col gap-4 rounded-2xl border bg-card p-5"
			aria-label={t.avatar}
		>
			<h2 className="text-lg font-bold">{t.avatar}</h2>
			<label className="flex flex-col gap-2 text-sm">
				{t.choose}
				<input
					type="file"
					accept="image/*"
					disabled={preparing || replacement.isPending || Boolean(file)}
					className="w-full rounded-lg border bg-background p-3 focus-visible:outline-2 focus-visible:outline-ring"
					onChange={async (event) => {
						const input = event.currentTarget,
							selected = input.files?.[0];
						if (!selected) return;
						setPreparing(true);
						setError("");
						setSaved(false);
						try {
							const converted = await imageToWebp(selected);
							if (alive.current) setFile(converted);
						} catch {
							if (alive.current) setError(t.errors.invalid);
						} finally {
							if (alive.current) setPreparing(false);
							input.value = "";
						}
					}}
				/>
			</label>
			{preparing && <p role="status">{t.preparing}</p>}
			{
				<img
					src={url || canonicalImage(currentImage) || "/logo.svg"}
					alt={t.avatar}
					width={96}
					height={96}
					className="size-24 rounded-full object-cover"
				/>
			}
			{file && (
				<TransferStatus
					locale={locale}
					snapshot={transfer.snapshot}
					disabled={replacement.isPending || preparing}
					onPause={transfer.pause}
					onResume={() => {
						void verify().then((ok) => {
							if (ok) void transfer.start();
						});
					}}
					onCancel={() => {
						setPreparing(true);
						void verify()
							.then(async (ok) => {
								if (ok) {
									await transfer.cancel();
									if (alive.current) setFile(null);
								}
							})
							.catch(() => {
								if (alive.current) setError(t.errors.unavailable);
							})
							.finally(() => {
								if (alive.current) setPreparing(false);
							});
					}}
				/>
			)}
			{file && (
				<Button
					type="button"
					disabled={
						transfer.snapshot.phase !== "ready" ||
						replacement.isPending ||
						preparing
					}
					onClick={() => {
						setError("");
						replacement.mutate();
					}}
				>
					{t.saveAvatar}
				</Button>
			)}
			{error && (
				<p role="alert" className="text-sm text-destructive">
					{error}
				</p>
			)}
			{saved && <p role="status">{t.saved}</p>}
		</section>
	);
}
