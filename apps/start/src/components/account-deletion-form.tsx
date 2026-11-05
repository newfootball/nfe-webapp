import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
	deleteOwnAccount,
	recoverAccountDeletion,
} from "../lib/account-deletion";
import { accountDeletionMessages } from "../lib/account-deletion-messages";
import { clearIdentityCache } from "../lib/auth-cache";
import { Button } from "./ui/button";

export function AccountDeletionForm({ locale }: { locale: "fr" | "en" }) {
	const t = accountDeletionMessages[locale];
	const queryClient = useQueryClient();
	const [confirmed, setConfirmed] = useState(false);
	const [requestId, setRequestId] = useState<string>();
	const mutation = useMutation({
		retry: false,
		mutationFn: async (id: string) => {
			const result = await deleteOwnAccount({
				data: { requestId: id, confirmation: "DELETE_ALL_SENT_RECEIVED" },
			});
			if (!result.ok) throw new Error("Deletion unavailable");
			return result.value;
		},
		onSuccess: async () => {
			await clearIdentityCache(queryClient);
			// A full navigation also discards private Router loader data.
			window.location.replace(`/${locale}/sign-in?notice=account-deletion`);
		},
	});
	return (
		<form
			className="space-y-4 rounded-lg border border-destructive p-4"
			onSubmit={(event) => {
				event.preventDefault();
				if (!confirmed || mutation.isPending) return;
				const id = requestId ?? crypto.randomUUID();
				setRequestId(id);
				mutation.mutate(id);
			}}
		>
			<h2 className="text-xl font-semibold">{t.title}</h2>
			<p>{t.description}</p>
			<label className="flex items-start gap-3">
				<input
					type="checkbox"
					required
					checked={confirmed}
					disabled={mutation.isPending}
					onChange={(event) => setConfirmed(event.target.checked)}
				/>
				{t.confirmation}
			</label>
			{mutation.isError && <p role="alert">{t.error}</p>}
			<Button
				type="submit"
				variant="destructive"
				disabled={!confirmed || mutation.isPending}
			>
				{mutation.isPending ? t.pending : t.submit}
			</Button>
		</form>
	);
}

export function AccountDeletionRecovery({ locale }: { locale: "fr" | "en" }) {
	const t = accountDeletionMessages[locale];
	const [operationId, setOperationId] = useState("");
	const mutation = useMutation({
		retry: false,
		mutationFn: async () => {
			const result = await recoverAccountDeletion({ data: { operationId } });
			if (!result.ok) throw new Error("Recovery unavailable");
			return result.value;
		},
	});
	return (
		<form
			className="space-y-3 rounded border p-4"
			onSubmit={(event) => {
				event.preventDefault();
				mutation.mutate();
			}}
		>
			<h2 className="text-lg font-semibold">{t.recovery}</h2>
			<label className="block">
				{t.operation}
				<input
					className="block w-full max-w-lg rounded border bg-background p-2"
					required
					maxLength={36}
					value={operationId}
					onChange={(event) => {
						setOperationId(event.target.value);
						mutation.reset();
					}}
				/>
			</label>
			<Button disabled={mutation.isPending} type="submit">
				{t.resume}
			</Button>
			{mutation.isError && <p role="alert">{t.error}</p>}
			{mutation.isSuccess && (
				<p role="status">{mutation.data.done ? t.done : t.resumed}</p>
			)}
		</form>
	);
}
