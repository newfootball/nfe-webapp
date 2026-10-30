import {
	PUBLIC_PAGE_LEGAL_DATE,
	publicPageContent,
} from "../../lib/public-page-content";
import {
	PublicPageLayout,
	type PublicPageProps,
	PublicPageSection,
} from "./layout";

export function PrivacyPage({ locale }: PublicPageProps) {
	const t = publicPageContent[locale].privacy;
	return (
		<PublicPageLayout
			locale={locale}
			title={t.title}
			intro={
				<p className="text-sm">
					{t["last-updated"]}:{" "}
					<time dateTime={PUBLIC_PAGE_LEGAL_DATE}>
						{locale === "fr" ? "29 septembre 2024" : "September 29, 2024"}
					</time>
				</p>
			}
		>
			<p>{t.intro}</p>
			{([1, 2, 3, 4] as const).map((section) => (
				<PublicPageSection key={section} title={t[`section-${section}-title`]}>
					<p>{t[`section-${section}`]}</p>
				</PublicPageSection>
			))}
			<PublicPageSection title={t["section-5-title"]}>
				<p>{t["section-5-intro"]}</p>
				<ul className="list-disc space-y-2 pl-6">
					{([1, 2, 3, 4] as const).map((item) => (
						<li key={item}>{t[`section-5-item-${item}`]}</li>
					))}
				</ul>
				<p>{t["section-5-outro"]}</p>
			</PublicPageSection>
			<PublicPageSection title={t["section-6-title"]}>
				<p>{t["section-6"]}</p>
			</PublicPageSection>
			{/* The legacy source supplies this heading only; no legal copy is invented. */}
			<PublicPageSection title={t["section-7-title"]} />
		</PublicPageLayout>
	);
}
