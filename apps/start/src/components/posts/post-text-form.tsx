import { useMutation } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "../../../../../components/ui/button";
import type { Locale } from "../../lib/messages";
import { savePostText } from "../../lib/post-text";
import { invalidatePostText } from "../../lib/post-text-cache";
import type { OwnPost, PostTextError } from "../../lib/post-text-contract";
import { EditPostTextSchema } from "../../lib/post-text-input";
import { postTextMessages } from "../../lib/post-text-messages";
export function PostTextForm({
	post,
	locale,
}: {
	post: OwnPost;
	locale: Locale;
}) {
	const router = useRouter(),
		{ queryClient } = router.options.context!,
		t = postTextMessages[locale];
	const [error, setError] = useState<PostTextError | null>(null),
		[saved, setSaved] = useState(false);
	const mutation = useMutation({
		mutationFn: savePostText,
		onSuccess: async (result) => {
			if (!result.ok) {
				setError(result.error);
				return;
			}
			setSaved(true);
			await invalidatePostText(queryClient);
			await router.invalidate({ sync: true });
		},
		onError: () => setError("unavailable"),
	});
	return (
		<form
			key={post.revision}
			className="flex max-w-xl flex-col gap-4"
			onSubmit={(event) => {
				event.preventDefault();
				setError(null);
				setSaved(false);
				const form = new FormData(event.currentTarget);
				const parsed = EditPostTextSchema.safeParse({
					id: post.id,
					expectedRevision: post.revision,
					title: form.get("title"),
					description: form.get("description"),
				});
				if (!parsed.success) {
					setError("invalid");
					return;
				}
				mutation.mutate({ data: parsed.data });
			}}
		>
			<p>{t.statuses[post.status ?? "legacy"]}</p>
			<label htmlFor="post-text-title">{t.title}</label>
			<input
				id="post-text-title"
				className="block w-full rounded border p-2"
				name="title"
				required
				maxLength={200}
				defaultValue={post.title}
				disabled={mutation.isPending}
			/>
			<label htmlFor="post-text-description">{t.description}</label>
			<textarea
				id="post-text-description"
				className="block min-h-40 w-full rounded border p-2"
				name="description"
				maxLength={10000}
				defaultValue={post.description}
				disabled={mutation.isPending}
			/>
			{error && <p role="alert">{t.errors[error]}</p>}
			{saved && <p role="status">{t.saved}</p>}
			<Button type="submit" disabled={mutation.isPending}>
				{mutation.isPending ? t.saving : t.save}
			</Button>
			{error === "conflict" && (
				<Button
					type="button"
					variant="outline"
					onClick={() => router.invalidate({ sync: true })}
				>
					{t.reload}
				</Button>
			)}
		</form>
	);
}
