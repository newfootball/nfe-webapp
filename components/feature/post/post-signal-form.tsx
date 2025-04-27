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
import { SignalReason } from "@prisma/client";
import { zodResolver } from "@hookform/resolvers/zod";
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
				toast.success(result.message || "Post signalé avec succès");
				onOpenChange(false);
				form.reset();
			}
		} catch (error) {
			console.error(error);
			toast.error("Échec du signalement du post");
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[425px]">
				<DialogHeader>
					<DialogTitle>Signaler ce post</DialogTitle>
					<DialogDescription>
						Veuillez indiquer la raison pour laquelle vous signalez ce post.
					</DialogDescription>
				</DialogHeader>
				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
						<FormField
							control={form.control}
							name="reason"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Raison</FormLabel>
									<Select
										onValueChange={field.onChange}
										defaultValue={field.value}
									>
										<FormControl>
											<SelectTrigger>
												<SelectValue placeholder="Sélectionnez une raison" />
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											<SelectItem value={SignalReason.INAPPROPRIATE}>
												Contenu inapproprié
											</SelectItem>
											<SelectItem value={SignalReason.SPAM}>Spam</SelectItem>
											<SelectItem value={SignalReason.OFFENSIVE}>
												Contenu offensant
											</SelectItem>
											<SelectItem value={SignalReason.MISLEADING}>
												Information trompeuse
											</SelectItem>
											<SelectItem value={SignalReason.OTHER}>Autre</SelectItem>
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
									<FormLabel>Détails (optionnel)</FormLabel>
									<FormControl>
										<Textarea
											placeholder="Fournissez plus de détails sur votre signalement"
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
								Annuler
							</Button>
							<Button type="submit">Signaler</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
