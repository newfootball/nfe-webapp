import { publicPageContent } from "../../lib/public-page-content";
import {
	PublicPageLayout,
	type PublicPageProps,
	PublicPageSection,
	publicPageLinkClass,
} from "./layout";

export function TermsPage({ locale }: PublicPageProps) {
	const t = publicPageContent[locale].terms;
	return (
		<PublicPageLayout
			locale={locale}
			title={t.title}
			intro={<p className="text-sm">{t["last-updated"]}</p>}
		>
			{([1, 2] as const).map((section) => (
				<PublicPageSection key={section} title={t[`section-${section}-title`]}>
					<p>{t[`section-${section}`]}</p>
				</PublicPageSection>
			))}
			<PublicPageSection title={t["section-3-title"]}>
				<p>
					{t["section-3-prefix"]}{" "}
					<a href="/privacy" className={publicPageLinkClass}>
						{t["section-3-link"]}
					</a>
					.
				</p>
			</PublicPageSection>
			{([4, 5] as const).map((section) => (
				<PublicPageSection key={section} title={t[`section-${section}-title`]}>
					<p>{t[`section-${section}`]}</p>
				</PublicPageSection>
			))}
			<PublicPageSection title={t["section-6-title"]}>
				<p>{t["section-6-intro"]}</p>
				<ul className="list-disc space-y-2 pl-6">
					{([1, 2, 3, 4, 5] as const).map((item) => (
						<li key={item}>{t[`section-6-item-${item}`]}</li>
					))}
				</ul>
			</PublicPageSection>
			{([7, 8, 9] as const).map((section) => (
				<PublicPageSection key={section} title={t[`section-${section}-title`]}>
					<p>{t[`section-${section}`]}</p>
				</PublicPageSection>
			))}
			<PublicPageSection title={t["section-10-title"]}>
				<p>
					{t["section-10-prefix"]}{" "}
					<a
						href="mailto:contact@nfe-foot.com"
						className={`${publicPageLinkClass} break-words`}
					>
						contact@nfe-foot.com
					</a>
					.
				</p>
			</PublicPageSection>
			<footer className="border-t border-border pt-6">
				<a href="/" className={`${publicPageLinkClass} inline-block py-2`}>
					{t["return-home"]}
				</a>
			</footer>
		</PublicPageLayout>
	);
}
