import { Button } from "../../../../../components/ui/button";
import { publicPageContent } from "../../lib/public-page-content";
import {
	PublicPageLayout,
	type PublicPageProps,
	PublicPageSection,
} from "./layout";

export function AboutUsPage({ locale }: PublicPageProps) {
	const t = publicPageContent[locale]["about-us"];
	return (
		<PublicPageLayout
			locale={locale}
			title={t.title}
			intro={<p>{t.description}</p>}
			wide
		>
			<PublicPageSection title={t["mission-title"]}>
				<p className="max-w-3xl">{t.mission}</p>
				<div className="flex flex-wrap gap-3 pt-2">
					<Button asChild className="min-h-11 h-auto whitespace-normal py-3">
						<a href="/sign-up">{t.join}</a>
					</Button>
					<Button
						asChild
						variant="outline"
						className="min-h-11 h-auto whitespace-normal py-3"
					>
						<a href="/contact">{t.contact}</a>
					</Button>
				</div>
			</PublicPageSection>
			<div className="grid gap-8 border-y border-border py-10 md:grid-cols-3">
				{(["players", "coaches", "clubs"] as const).map((audience) => (
					<PublicPageSection key={audience} title={t[`for-${audience}-title`]}>
						<p className="text-muted-foreground">{t[`for-${audience}`]}</p>
					</PublicPageSection>
				))}
			</div>
			<PublicPageSection title={t["values-title"]}>
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
					{(
						["community", "opportunity", "development", "inclusivity"] as const
					).map((value) => (
						<div
							key={value}
							className="rounded-lg border border-border bg-muted p-6"
						>
							<h3 className="mb-3 font-oswald text-xl font-semibold">
								{t[`value-${value}`]}
							</h3>
							<p className="text-sm leading-relaxed text-muted-foreground">
								{t[`value-${value}-desc`]}
							</p>
						</div>
					))}
				</div>
			</PublicPageSection>
		</PublicPageLayout>
	);
}
