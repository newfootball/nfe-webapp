import type { SignalStatus } from "@prisma/client";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Layout } from "@/components/layouts/layout";
import { getSignals } from "@/src/query/signal.query";
import { SignalList } from "./_components/signal-list";

const TABS: { status: SignalStatus; key: string }[] = [
	{ status: "PENDING", key: "pending" },
	{ status: "REVIEWED", key: "reviewed" },
	{ status: "DISMISSED", key: "dismissed" },
];

export default async function AdminSignalsPage({
	searchParams,
}: {
	searchParams: Promise<{ status?: string }>;
}) {
	const { status = "PENDING" } = await searchParams;
	const t = await getTranslations("admin.moderation");

	const currentStatus =
		TABS.find((tab) => tab.status === status)?.status ?? "PENDING";
	const signals = await getSignals(currentStatus);

	return (
		<Layout>
			<div className="flex flex-col gap-6">
				<div>
					<h1 className="text-2xl font-bold">{t("title")}</h1>
					<p className="text-sm text-muted-foreground mt-1">
						{t("description")}
					</p>
				</div>

				<div className="flex gap-1 border-b">
					{TABS.map((tab) => (
						<Link
							key={tab.status}
							href={`/admin/signals?status=${tab.status}`}
							className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
								currentStatus === tab.status
									? "border-primary text-foreground"
									: "border-transparent text-muted-foreground hover:text-foreground"
							}`}
						>
							{t(tab.key as Parameters<typeof t>[0])}
						</Link>
					))}
				</div>

				<SignalList signals={signals} status={currentStatus} />
			</div>
		</Layout>
	);
}
