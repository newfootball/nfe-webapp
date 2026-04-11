"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { updatePost } from "@/src/actions/post.action";

const postEditSchema = z.object({
	title: z.string().min(1),
	description: z.string().min(1),
});

type PostEditValues = z.infer<typeof postEditSchema>;

interface PostEditFormProps {
	post: { id: string; title: string; description: string };
}

export function PostEditForm({ post }: PostEditFormProps) {
	const t = useTranslations("posts.edit");
	const router = useRouter();

	const form = useForm<PostEditValues>({
		resolver: zodResolver(postEditSchema),
		defaultValues: {
			title: post.title,
			description: post.description,
		},
	});

	const { isSubmitting } = form.formState;

	const onSubmit = async (data: PostEditValues) => {
		const result = await updatePost(post.id, data);
		if (result.error) {
			toast.error(result.error);
			return;
		}
		toast.success(t("saved"));
		router.push(`/post/${post.id}`);
	};

	return (
		<div className="space-y-4">
			<Link
				href={`/post/${post.id}`}
				className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
			>
				<ArrowLeft className="h-4 w-4" />
				{t("back")}
			</Link>

			<Form {...form}>
				<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
					<FormField
						control={form.control}
						name="title"
						render={({ field }) => (
							<FormItem>
								<FormLabel>{t("title-label")}</FormLabel>
								<FormControl>
									<Input {...field} disabled={isSubmitting} />
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<FormField
						control={form.control}
						name="description"
						render={({ field }) => (
							<FormItem>
								<FormLabel>{t("description-label")}</FormLabel>
								<FormControl>
									<Textarea {...field} rows={4} disabled={isSubmitting} />
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<Button type="submit" disabled={isSubmitting} className="w-full">
						{isSubmitting ? (
							<>
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								{t("saving")}
							</>
						) : (
							t("save")
						)}
					</Button>
				</form>
			</Form>
		</div>
	);
}
