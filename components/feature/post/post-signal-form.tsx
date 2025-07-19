"use client";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { signalPost } from "@/src/actions/post.action";
import { zodResolver } from "@hookform/resolvers/zod";
import { SignalReason } from "@prisma/client";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const signalFormSchema = z.object({
	reason: z.nativeEnum(SignalReason),
	details: z.string().optional(),
});

type SignalFormValues = z.infer<typeof signalFormSchema>;

interface PostSignalFormProps {
	postId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function PostSignalForm({
	postId,
	open,
	onOpenChange,
}: PostSignalFormProps) {
	const t = useTranslations("posts.post-signal-form");
	const form = useForm<SignalFormValues>({
		resolver: zodResolver(signalFormSchema),
		defaultValues: {
			reason: SignalReason.OTHER,
			details: "",
		},
	});

	const onSubmit = async (data: SignalFormValues) => {
		try {
			const result = await signalPost(postId, data.reason, data.details);

			if (result.error) {
				toast.error(result.error);
			} else {
				toast.success(result.message || t("post-reported-successfully"));
				onOpenChange(false);
				form.reset();
			}
		} catch (error) {
			console.error(error);
			toast.error(t("post-reporting-failed"));
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[425px]">
				<DialogHeader>
					<DialogTitle>{t("report-post")}</DialogTitle>
					<DialogDescription>
						{t("please-indicate-the-reason-for-reporting-this-post")}
					</DialogDescription>
				</DialogHeader>
				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
						<FormField
							control={form.control}
							name="reason"
							render={({ field }) => (
								<FormItem>
									<FormLabel>{t("reason")}</FormLabel>
									<Select
										onValueChange={field.onChange}
										defaultValue={field.value}
									>
										<FormControl>
											<SelectTrigger>
												<SelectValue placeholder={t("select-reason")} />
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											<SelectItem value={SignalReason.INAPPROPRIATE}>
												{t("inappropriate-content")}
											</SelectItem>
											<SelectItem value={SignalReason.SPAM}>
												{t("spam")}
											</SelectItem>
											<SelectItem value={SignalReason.OFFENSIVE}>
												{t("offensive-content")}
											</SelectItem>
											<SelectItem value={SignalReason.MISLEADING}>
												{t("misleading-information")}
											</SelectItem>
											<SelectItem value={SignalReason.OTHER}>
												{t("other")}
											</SelectItem>
										</SelectContent>
									</Select>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="details"
							render={({ field }) => (
								<FormItem>
									<FormLabel>{t("details")}</FormLabel>
									<FormControl>
										<Textarea
											placeholder={t("provide-more-details-on-your-report")}
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								onClick={() => onOpenChange(false)}
							>
								{t("cancel")}
							</Button>
							<Button type="submit">{t("report")}</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
