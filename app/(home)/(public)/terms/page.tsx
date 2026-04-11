import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function TermsAndConditions() {
	const t = await getTranslations("terms");

	return (
		<>
			<h1 className="text-2xl font-bold text-indigo-800">{t("title")}</h1>
			<p className="mt-1 text-sm text-indigo-200">{t("last-updated")}</p>
			<div className="px-4 py-5 sm:p-6">
				<div className="prose prose-indigo max-w-none">
					<h2>{t("section-1-title")}</h2>
					<p>{t("section-1")}</p>

					<h2>{t("section-2-title")}</h2>
					<p>{t("section-2")}</p>

					<h2>{t("section-3-title")}</h2>
					<p>
						{t("section-3-prefix")}{" "}
						<Link
							href="/privacy"
							className="text-indigo-600 hover:text-indigo-800"
						>
							{t("section-3-link")}
						</Link>
						.
					</p>

					<h2>{t("section-4-title")}</h2>
					<p>{t("section-4")}</p>

					<h2>{t("section-5-title")}</h2>
					<p>{t("section-5")}</p>

					<h2>{t("section-6-title")}</h2>
					<p>{t("section-6-intro")}</p>
					<ul>
						<li>{t("section-6-item-1")}</li>
						<li>{t("section-6-item-2")}</li>
						<li>{t("section-6-item-3")}</li>
						<li>{t("section-6-item-4")}</li>
						<li>{t("section-6-item-5")}</li>
					</ul>

					<h2>{t("section-7-title")}</h2>
					<p>{t("section-7")}</p>

					<h2>{t("section-8-title")}</h2>
					<p>{t("section-8")}</p>

					<h2>{t("section-9-title")}</h2>
					<p>{t("section-9")}</p>

					<h2>{t("section-10-title")}</h2>
					<p>
						{t("section-10-prefix")}{" "}
						<a
							href="mailto:contact@nfe-foot.com"
							className="text-indigo-600 hover:text-indigo-800"
						>
							contact@nfe-foot.com
						</a>
						.
					</p>
				</div>
			</div>
			<div className="bg-gray-50 px-4 py-4 sm:px-6">
				<div className="text-sm">
					<Link
						href="/"
						className="font-medium text-indigo-600 hover:text-indigo-500"
					>
						{t("return-home")}
					</Link>
				</div>
			</div>
		</>
	);
}
