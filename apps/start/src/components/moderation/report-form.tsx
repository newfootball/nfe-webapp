import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "../../../../../components/ui/button";
import type { Locale } from "../../lib/messages";
import { reportPost } from "../../lib/moderation";
import { type ReportInput, SIGNAL_REASONS } from "../../lib/moderation-input";
import { moderationMessages } from "../../lib/moderation-messages";
export function ReportForm({
	postId,
	locale,
}: {
	postId: string;
	locale: Locale;
}) {
	const t = moderationMessages[locale],
		[reason, setReason] = useState<ReportInput["reason"]>("INAPPROPRIATE"),
		[details, setDetails] = useState("");
	const change = useMutation({
		mutationFn: async () => {
			const r = await reportPost({ data: { postId, reason, details } });
			if (!r.ok) throw new Error(r.error);
			return r.value;
		},
	});
	return (
		<details className="mt-6 rounded border p-4">
			<summary>{t.report}</summary>
			<form
				className="mt-4 space-y-4"
				onSubmit={(e) => {
					e.preventDefault();
					change.mutate();
				}}
			>
				<label className="block">
					{t.reason}
					<select
						className="block rounded border bg-background p-2"
						value={reason}
						onChange={(e) => setReason(e.target.value as ReportInput["reason"])}
					>
						{SIGNAL_REASONS.map((r) => (
							<option key={r} value={r}>
								{t.reasons[r]}
							</option>
						))}
					</select>
				</label>
				<label className="block">
					{t.details}
					<textarea
						className="block w-full rounded border bg-background p-2"
						maxLength={65535}
						value={details}
						onChange={(e) => setDetails(e.target.value)}
					/>
				</label>
				<Button disabled={change.isPending || change.isSuccess} type="submit">
					{t.send}
				</Button>
				{change.isError && <p role="alert">{t.error}</p>}
				{change.isSuccess && (
					<p role="status">{change.data.created ? t.sent : t.duplicate}</p>
				)}
			</form>
		</details>
	);
}
