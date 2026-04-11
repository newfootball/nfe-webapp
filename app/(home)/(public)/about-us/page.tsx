import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";

export default async function AboutPage() {
	const t = await getTranslations("about-us");

	return (
		<Shell>
			<div className="container mx-auto px-4 py-12">
				<div className="grid gap-12 lg:grid-cols-2">
					<div className="flex flex-col justify-center space-y-6">
						<h1 className="text-4xl font-bold tracking-tight">{t("title")}</h1>
						<p className="text-lg text-muted-foreground">{t("description")}</p>
						<div className="space-y-4">
							<h2 className="text-2xl font-semibold">{t("mission-title")}</h2>
							<p className="text-muted-foreground">{t("mission")}</p>
						</div>
						<div className="flex gap-4">
							<Button asChild>
								<Link href="/sign-up">{t("join")}</Link>
							</Button>
							<Button variant="outline" asChild>
								<Link href="/contact">{t("contact")}</Link>
							</Button>
						</div>
					</div>
					<div className="relative aspect-square overflow-hidden rounded-xl lg:aspect-auto">
						<Image
							src="https://images.unsplash.com/photo-1517466787929-bc90951d0974?q=80&w=2000"
							alt={t("title")}
							fill
							className="object-cover"
							priority
						/>
					</div>
				</div>

				<div className="mt-24 grid gap-12 sm:grid-cols-2 lg:grid-cols-3">
					<div className="space-y-4">
						<h3 className="text-xl font-semibold">{t("for-players-title")}</h3>
						<p className="text-muted-foreground">{t("for-players")}</p>
					</div>
					<div className="space-y-4">
						<h3 className="text-xl font-semibold">{t("for-coaches-title")}</h3>
						<p className="text-muted-foreground">{t("for-coaches")}</p>
					</div>
					<div className="space-y-4">
						<h3 className="text-xl font-semibold">{t("for-clubs-title")}</h3>
						<p className="text-muted-foreground">{t("for-clubs")}</p>
					</div>
				</div>

				<div className="mt-24">
					<h2 className="mb-8 text-center text-3xl font-bold">
						{t("values-title")}
					</h2>
					<div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
						<div className="rounded-lg bg-muted p-6">
							<h3 className="mb-2 font-semibold">{t("value-community")}</h3>
							<p className="text-sm text-muted-foreground">
								{t("value-community-desc")}
							</p>
						</div>
						<div className="rounded-lg bg-muted p-6">
							<h3 className="mb-2 font-semibold">{t("value-opportunity")}</h3>
							<p className="text-sm text-muted-foreground">
								{t("value-opportunity-desc")}
							</p>
						</div>
						<div className="rounded-lg bg-muted p-6">
							<h3 className="mb-2 font-semibold">{t("value-development")}</h3>
							<p className="text-sm text-muted-foreground">
								{t("value-development-desc")}
							</p>
						</div>
						<div className="rounded-lg bg-muted p-6">
							<h3 className="mb-2 font-semibold">{t("value-inclusivity")}</h3>
							<p className="text-sm text-muted-foreground">
								{t("value-inclusivity-desc")}
							</p>
						</div>
					</div>
				</div>
			</div>
		</Shell>
	);
}
