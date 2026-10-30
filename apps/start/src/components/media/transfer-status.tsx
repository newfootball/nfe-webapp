import { Button } from "../../../../../components/ui/button";
import { mediaError, mediaMessages } from "../../lib/media-messages";
import type { TransferSnapshot } from "../../lib/media-upload";
import type { Locale } from "../../lib/messages";
export function TransferStatus({
	snapshot,
	locale,
	onPause,
	onResume,
	onCancel,
	disabled = false,
}: {
	snapshot: TransferSnapshot;
	locale: Locale;
	onPause: () => void;
	onResume: () => void;
	onCancel: () => void;
	disabled?: boolean;
}) {
	const t = mediaMessages[locale],
		phase = snapshot.phase;
	return (
		<div className="flex flex-col gap-3 rounded-xl border bg-muted/30 p-4">
			<p role="status" aria-live="polite" className="text-sm font-medium">
				{t.phases[phase]}
				{phase === "uploading" ? ` · ${snapshot.progress}%` : ""}
			</p>
			<progress
				className="h-2 w-full accent-primary"
				value={snapshot.progress}
				max={100}
				aria-label={t.phases[phase]}
			/>
			{phase === "error" && (
				<p role="alert" className="text-sm text-destructive">
					{mediaError(locale, snapshot.error ?? "unavailable")}
				</p>
			)}
			<div className="flex flex-wrap gap-2">
				{["hashing", "uploading", "validating"].includes(phase) && (
					<Button
						disabled={disabled}
						type="button"
						variant="outline"
						onClick={onPause}
					>
						{t.pause}
					</Button>
				)}
				{["idle", "paused", "error"].includes(phase) && (
					<Button
						disabled={disabled}
						type="button"
						variant="secondary"
						onClick={onResume}
					>
						{phase === "idle"
							? t.upload
							: phase === "paused"
								? t.resume
								: t.retry}
					</Button>
				)}
				{phase !== "cancelled" && (
					<Button
						disabled={disabled}
						type="button"
						variant="ghost"
						onClick={onCancel}
					>
						{t.cancel}
					</Button>
				)}
			</div>
		</div>
	);
}
