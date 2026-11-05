import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useRef, useState } from "react";
import type { Locale } from "../../lib/messages";
import {
	changePostMedia,
	changePostStatus,
	continuePostLifecycle,
	getPostLifecycle,
	removePost,
} from "../../lib/post-lifecycle";
import type { LifecycleProgress } from "../../lib/post-lifecycle-contract";
import { lifecycleMessages } from "../../lib/post-lifecycle-messages";
import { clearPostLifecycleCache } from "../../lib/post-text-cache";
import type { OwnPost } from "../../lib/post-text-contract";
import { postTextMessages } from "../../lib/post-text-messages";
import { TransferStatus } from "../media/transfer-status";
import { useIdentityGuard, useTransfer } from "../media/use-transfer";
import { Button } from "../ui/button";

export function PostLifecyclePanel({
	post,
	locale,
}: {
	post: OwnPost;
	locale: Locale;
}) {
	const identity = useIdentityGuard(post.userId),
		router = useRouter(),
		{ queryClient } = router.options.context!,
		t = lifecycleMessages[locale];
	const [confirm, setConfirm] = useState(false),
		[error, setError] = useState(""),
		[notice, setNotice] = useState("");
	const request = useRef<{ signature: string; id: string } | null>(null);
	const pending = useQuery({
		queryKey: ["post-lifecycle", post.userId, post.id],
		queryFn: () => getPostLifecycle({ data: { id: post.id } }),
		staleTime: 0,
	});
	const op = pending.data?.ok ? pending.data.value : null;
	const mutation = useMutation({
		mutationFn: async (
			action: "PUBLISHED" | "ARCHIVED" | "DELETE" | "RESUME",
		) => {
			if (!(await identity.verify())) throw new Error(t.unavailable);
			if (action === "RESUME") {
				if (!op) throw new Error(t.unavailable);
				// One explicit UI request performs a bounded amount of work. Remaining work
				// stays durable and can be resumed after a crash, navigation or reload.
				let progress: LifecycleProgress = op;
				for (let n = 0; n < 50 && !progress.done; n++) {
					if (!(await identity.verify())) throw new Error(t.unavailable);
					const result = await continuePostLifecycle({
						data: { operationId: progress.operationId },
					});
					if (!result.ok)
						throw new Error(postTextMessages[locale].errors[result.error]);
					progress = result.value;
				}
				return progress.done;
			}
			const base = { id: post.id, expectedRevision: post.revision };
			const signature = JSON.stringify(base);
			if (request.current?.signature !== signature)
				request.current = { signature, id: crypto.randomUUID() };
			const result =
				action === "DELETE"
					? await removePost({
							data: { ...base, requestId: request.current.id },
						})
					: await changePostStatus({ data: { ...base, target: action } });
			if (!result.ok)
				throw new Error(postTextMessages[locale].errors[result.error]);
			return false;
		},
		onSuccess: async (done) => {
			if (!(await identity.verify())) return;
			setConfirm(false);
			setNotice(t.done);
			setError("");
			await clearPostLifecycleCache(queryClient);
			if (done && op?.phase && post.status === "ARCHIVED") {
				// The parent may have been deleted; navigate to its surviving own list.
				await router.navigate({
					to: "/$locale/post/my",
					params: { locale },
					search: { cursor: null },
				});
			}
			await router.invalidate({ sync: true });
		},
		onError: (e) => setError(e.message),
	});
	if (!identity.active) return <p role="alert">{t.unavailable}</p>;
	const busy = mutation.isPending;
	return (
		<section className="space-y-4 rounded border p-4" aria-label={t.remove}>
			<p className="text-sm text-muted-foreground">{t.privateArchive}</p>
			{error && <p role="alert">{error}</p>}
			{notice && <p role="status">{notice}</p>}
			{pending.isError || (pending.data && !pending.data.ok) ? (
				<p role="alert">{t.unavailable}</p>
			) : op ? (
				<div>
					<p>{t.pending}</p>
					<Button disabled={busy} onClick={() => mutation.mutate("RESUME")}>
						{busy ? t.busy : t.resume}
					</Button>
				</div>
			) : (
				<>
					<div className="flex flex-wrap gap-4">
						{post.status === "DRAFT" && (
							<Button
								disabled={busy || pending.isPending}
								onClick={() => mutation.mutate("PUBLISHED")}
							>
								{t.publish}
							</Button>
						)}
						{post.status === "PUBLISHED" && (
							<Button
								disabled={busy || pending.isPending}
								onClick={() => mutation.mutate("ARCHIVED")}
							>
								{t.archive}
							</Button>
						)}
						<Button
							variant="destructive"
							disabled={busy || pending.isPending}
							onClick={() => setConfirm(true)}
						>
							{t.remove}
						</Button>
					</div>
					{confirm && (
						<fieldset aria-label={t.confirm} className="space-y-3">
							<p>{t.warning}</p>
							<Button
								variant="destructive"
								disabled={busy}
								onClick={() => mutation.mutate("DELETE")}
							>
								{t.confirm}
							</Button>
							<Button
								variant="outline"
								disabled={busy}
								onClick={() => setConfirm(false)}
							>
								{t.cancel}
							</Button>
						</fieldset>
					)}
					{!busy && !pending.isPending && (
						<Replacement
							key={post.revision}
							post={post}
							locale={locale}
							verify={identity.verify}
						/>
					)}
				</>
			)}
		</section>
	);
}
function Replacement({
	post,
	locale,
	verify,
}: {
	post: OwnPost;
	locale: Locale;
	verify: () => Promise<boolean>;
}) {
	const t = lifecycleMessages[locale],
		router = useRouter(),
		{ queryClient } = router.options.context!;
	const [video, setVideo] = useState<File | null>(null),
		[cover, setCover] = useState<File | null>(null),
		[error, setError] = useState("");
	const videoTransfer = useTransfer(video, "video"),
		coverTransfer = useTransfer(cover, "thumbnail"),
		request = useRef<string | null>(null);
	const mutation = useMutation({
		mutationFn: async () => {
			if (!(await verify())) throw new Error(t.unavailable);
			if (
				videoTransfer.snapshot.phase !== "ready" ||
				coverTransfer.snapshot.phase !== "ready"
			)
				throw new Error(t.unavailable);
			request.current ??= crypto.randomUUID();
			const result = await changePostMedia({
				data: {
					id: post.id,
					expectedRevision: post.revision,
					requestId: request.current,
					videoId: videoTransfer.snapshot.assetId!,
					thumbnailId: coverTransfer.snapshot.assetId!,
				},
			});
			if (!result.ok)
				throw new Error(postTextMessages[locale].errors[result.error]);
		},
		onSuccess: async () => {
			if (!(await verify())) return;
			await clearPostLifecycleCache(queryClient);
			await router.invalidate({ sync: true });
		},
		onError: (e) => setError(e.message),
	});
	return (
		<fieldset className="space-y-3" disabled={mutation.isPending}>
			<legend>{t.replace}</legend>
			{[
				{
					label: t.video,
					file: video,
					set: setVideo,
					transfer: videoTransfer,
					accept: "video/mp4",
				},
				{
					label: t.thumbnail,
					file: cover,
					set: setCover,
					transfer: coverTransfer,
					accept: "image/webp",
				},
			].map((item, index) => (
				<div key={item.accept} className="space-y-2">
					<label className="block">
						{item.label}
						<input
							type="file"
							accept={item.accept}
							disabled={Boolean(item.file)}
							onChange={(e) => {
								item.set(e.target.files?.[0] ?? null);
								request.current = null;
							}}
						/>
					</label>
					{item.file && (
						<TransferStatus
							locale={locale}
							snapshot={item.transfer.snapshot}
							onPause={item.transfer.pause}
							onResume={() => {
								void verify().then((ok) => {
									if (ok) void item.transfer.start();
								});
							}}
							onCancel={() => {
								void verify()
									.then(async (ok) => {
										if (ok) {
											await item.transfer.cancel();
											item.set(null);
											request.current = null;
										}
									})
									.catch(() => setError(t.unavailable));
							}}
						/>
					)}
					<span className="sr-only">{index + 1}</span>
				</div>
			))}
			{error && <p role="alert">{error}</p>}
			<Button
				disabled={
					videoTransfer.snapshot.phase !== "ready" ||
					coverTransfer.snapshot.phase !== "ready" ||
					mutation.isPending
				}
				onClick={() => mutation.mutate()}
			>
				{mutation.isPending ? t.busy : t.replace}
			</Button>
		</fieldset>
	);
}
