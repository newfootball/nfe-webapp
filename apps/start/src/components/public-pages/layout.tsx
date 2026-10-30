import type { ReactNode } from "react";
import type { PublicPageLocale } from "../../lib/public-page-content";

export type PublicPageProps = { locale: PublicPageLocale };

export const publicPageLinkClass =
	"rounded-sm underline underline-offset-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

/** Article only: the host route owns the document, main landmark and metadata. */
export function PublicPageLayout({
	locale,
	title,
	intro,
	children,
	wide = false,
}: PublicPageProps & {
	title: string;
	intro?: ReactNode;
	children: ReactNode;
	wide?: boolean;
}) {
	return (
		<article
			lang={locale}
			className={`mx-auto w-full px-5 py-12 text-foreground sm:px-8 sm:py-20 ${wide ? "max-w-6xl" : "max-w-3xl"}`}
		>
			<header className="mb-10 border-b border-border pb-8 sm:mb-12">
				<div aria-hidden="true" className="mb-6 h-1 w-12 bg-primary" />
				<h1 className="max-w-3xl font-oswald text-4xl font-bold leading-tight tracking-tight text-balance sm:text-5xl">
					{title}
				</h1>
				{intro && (
					<div className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
						{intro}
					</div>
				)}
			</header>
			<div className="space-y-10 text-base leading-relaxed sm:space-y-12">
				{children}
			</div>
		</article>
	);
}

export function PublicPageSection({
	title,
	children,
}: {
	title: string;
	children?: ReactNode;
}) {
	return (
		<section className="space-y-4">
			<h2 className="font-oswald text-2xl font-semibold leading-snug tracking-tight sm:text-3xl">
				{title}
			</h2>
			{children}
		</section>
	);
}
