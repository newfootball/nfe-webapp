"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import {
	type FormEvent,
	forwardRef,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from "react";
import { ZodError } from "zod";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { saveComment } from "@/src/actions/comment.action";
import { commentKeys } from "@/src/hooks/use-comment-query";
import { useSession } from "@/src/lib/auth-client";
import { CommentSchema } from "@/src/schemas/comment.schema";

interface PostFormCommentProps {
	postId: string;
	onCommentPosted?: () => void;
}

export interface PostFormCommentHandle {
	focus: () => void;
}

function getCommentResultErrorMessage(error: unknown, fallback: string) {
	if (!Array.isArray(error)) return fallback;
	return error[0]?.message ?? fallback;
}

function getCaughtErrorMessage(error: unknown, fallback: string) {
	if (!(error instanceof ZodError)) return fallback;
	return error.issues[0]?.message ?? fallback;
}

export const PostFormComment = forwardRef<
	PostFormCommentHandle,
	PostFormCommentProps
>(({ postId, onCommentPosted }, ref) => {
	const t = useTranslations("posts.post-form-comment");
	const { data: session } = useSession();
	const userId = session?.user?.id;
	const queryClient = useQueryClient();
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	const [mounted, setMounted] = useState(false);
	const [comment, setComment] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useImperativeHandle(ref, () => ({
		focus: () => {
			textareaRef.current?.focus();
			textareaRef.current?.scrollIntoView({
				behavior: "smooth",
				block: "center",
			});
		},
	}));

	useEffect(() => {
		setMounted(true);
	}, []);

	const handleSaveComment = async (e: FormEvent) => {
		e.preventDefault();
		setError(null);
		const fallbackError = t("an-error-occurred-while-saving-the-comment");

		try {
			CommentSchema.parse({ postId, content: comment });

			setIsSubmitting(true);
			const result = await saveComment({ postId, content: comment.trim() });

			if (!result.success) {
				setError(getCommentResultErrorMessage(result.error, fallbackError));
				return;
			}

			setComment("");
			queryClient.invalidateQueries({ queryKey: commentKeys.list(postId) });
			queryClient.invalidateQueries({ queryKey: commentKeys.count(postId) });
			onCommentPosted?.();
		} catch (error) {
			setError(getCaughtErrorMessage(error, fallbackError));
		} finally {
			setIsSubmitting(false);
		}
	};

	if (!mounted) {
		return (
			<div className="mt-2">
				<div className="h-10" />
			</div>
		);
	}

	return (
		<div className="mt-2">
			{!userId ? (
				<p className="text-sm text-center text-muted-foreground">
					{t("you-must-be-logged-in-to-comment")}
				</p>
			) : (
				<form onSubmit={handleSaveComment}>
					<div className="flex items-center space-x-3">
						<Avatar className="w-8 h-8 mt-1">
							<AvatarImage
								src={session?.user?.image || undefined}
								alt={t("your-avatar")}
							/>
							<AvatarFallback>
								{session?.user?.name?.charAt(0).toUpperCase() || "?"}
							</AvatarFallback>
						</Avatar>
						<div className="flex-grow">
							<textarea
								ref={textareaRef}
								id="comment"
								name="comment"
								value={comment}
								onChange={(e) => setComment(e.target.value)}
								placeholder={t("share-your-opinion")}
								className="w-full bg-transparent text-sm focus:outline-none min-h-[40px] resize-y"
								disabled={isSubmitting}
								rows={1}
								style={{ minHeight: "2.5rem", height: "auto" }}
							/>
						</div>
						<Button
							variant="default"
							className="text-current-foreground rounded-full"
							type="submit"
							disabled={isSubmitting || !comment.trim()}
							size="icon"
						>
							{isSubmitting ? (
								<Loader2 className="h-4 w-4 animate-spin" />
							) : (
								<Send className="h-4 w-4" />
							)}
						</Button>
					</div>
					{error && <p className="mt-1 text-sm text-red-500">{error}</p>}
				</form>
			)}
		</div>
	);
});

PostFormComment.displayName = "PostFormComment";
