import { FlagIcon, UsersIcon } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Layout } from "@/components/layouts/layout";
import { Button } from "@/components/ui/button";
import { getPendingSignalCount } from "@/src/query/signal.query";

export default async function AdminPage() {
	const [t, pendingCount] = await Promise.all([
		getTranslations("admin"),
		getPendingSignalCount(),
	]);

	return (
		<Layout>
			<div className="flex flex-col gap-4">
				<h1 className="text-2xl font-bold">Admin</h1>
				<p className="text-sm text-muted-foreground">
					Welcome to the admin dashboard
				</p>
				<div className="flex gap-3 flex-wrap">
					<Link href="/admin/users" className="text-sm text-muted-foreground">
						<Button variant="outline" className="w-fit">
							<UsersIcon className="w-4 h-4" />
							Users
						</Button>
					</Link>
					<Link href="/admin/signals" className="relative">
						<Button variant="outline" className="w-fit">
							<FlagIcon className="w-4 h-4" />
							{t("signals")}
						</Button>
						{pendingCount > 0 && (
							<span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center font-medium">
								{pendingCount > 9 ? "9+" : pendingCount}
							</span>
						)}
					</Link>
				</div>
			</div>
		</Layout>
	);
}
