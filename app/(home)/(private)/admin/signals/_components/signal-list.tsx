"use client";

import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
	dismissSignal,
	rejectSignaledPost,
	reviewSignal,
} from "@/src/actions/signal.action";
import type { SignalStatus } from "@/src/generated/prisma/client";
import type { SignalWithRelations } from "@/src/query/signal.query";

const REASON_KEY_MAP: Record<string, string> = {
	INAPPROPRIATE: "reason-inappropriate",
	SPAM: "reason-spam",
	OFFENSIVE: "reason-offensive",
	MISLEADING: "reason-misleading",
	OTHER: "reason-other",
};

export function SignalList({
	signals,
	status,
}: {
	signals: SignalWithRelations[];
	status: SignalStatus;
}) {
	const t = useTranslations("admin.moderation");

	if (signals.length === 0) {
		return (
			<p className="text-sm text-muted-foreground text-center py-12">
				{t("no-signals")}
			</p>
		);
	}

	return (
		<div className="flex flex-col gap-4">
			{signals.map((signal) => (
				<SignalCard key={signal.id} signal={signal} status={status} />
			))}
		</div>
	);
}

function SignalCard({
	signal,
	status,
}: {
	signal: SignalWithRelations;
	status: SignalStatus;
}) {
	const t = useTranslations("admin.moderation");
	const [isPending, startTransition] = useTransition();

	const handleKeep = () => {
		startTransition(async () => {
			const result = await reviewSignal(signal.id);
			if (result.error) {
				toast.error(result.error);
			} else {
				toast.success(t("post-kept"));
			}
		});
	};

	const handleReject = () => {
		startTransition(async () => {
			const result = await rejectSignaledPost(signal.postId, signal.id);
			if (result.error) {
				toast.error(result.error);
			} else {
				toast.success(t("post-rejected"));
			}
		});
	};

	const handleDismiss = () => {
		startTransition(async () => {
			const result = await dismissSignal(signal.id);
			if (result.error) {
				toast.error(result.error);
			} else {
				toast.success(t("signal-dismissed"));
			}
		});
	};

	return (
		<Card className="p-4">
			<div className="flex flex-col gap-3">
				<div className="flex items-start justify-between gap-4">
					<div className="flex-1 min-w-0">
						<Link
							href={`/post/${signal.postId}`}
							className="font-medium hover:underline truncate block"
						>
							{signal.post.title ?? t("post")}
						</Link>
						<div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
							<span>
								{t("reason")}:{" "}
								<span className="text-foreground">
									{t(
										(REASON_KEY_MAP[signal.reason] ??
											"reason-other") as Parameters<typeof t>[0],
									)}
								</span>
							</span>
						</div>
						{signal.details && (
							<p className="text-sm text-muted-foreground mt-1 line-clamp-2">
								{signal.details}
							</p>
						)}
					</div>

					{status !== "PENDING" && (
						<Badge variant={status === "REVIEWED" ? "secondary" : "outline"}>
							{t(status.toLowerCase() as Parameters<typeof t>[0])}
						</Badge>
					)}
				</div>

				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<Avatar className="h-6 w-6">
						<AvatarImage
							src={signal.user.image ?? ""}
							alt={signal.user.name ?? ""}
						/>
						<AvatarFallback>{(signal.user.name ?? "?")[0]}</AvatarFallback>
					</Avatar>
					<span>{signal.user.name}</span>
					<span>·</span>
					<span>
						{formatDistanceToNow(new Date(signal.createdAt), {
							addSuffix: true,
						})}
					</span>
				</div>

				{status === "PENDING" && (
					<div className="flex gap-2 pt-1">
						<Button
							size="sm"
							variant="outline"
							onClick={handleKeep}
							disabled={isPending}
						>
							{t("keep-post")}
						</Button>
						<Button
							size="sm"
							variant="destructive"
							onClick={handleReject}
							disabled={isPending}
						>
							{t("reject-post")}
						</Button>
						<Button
							size="sm"
							variant="ghost"
							onClick={handleDismiss}
							disabled={isPending}
						>
							{t("dismiss")}
						</Button>
					</div>
				)}
			</div>
		</Card>
	);
}
