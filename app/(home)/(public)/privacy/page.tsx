import { getTranslations } from "next-intl/server";

export default async function PrivacyPage() {
	const t = await getTranslations("privacy");

	return (
		<>
			<h1 className="text-2xl font-bold text-indigo-800">{t("title")}</h1>
			<p className="mt-1 text-sm text-indigo-200">
				{t("last-updated")}: {new Date("2024-09-29").toLocaleDateString()}
			</p>
			<div className="px-4 py-5 sm:p-6">
				<div className="prose prose-indigo max-w-none">
					<p className="mt-2">{t("intro")}</p>

					<h2 className="mt-4 text-3xl">{t("section-1-title")}</h2>
					<p className="mt-2">{t("section-1")}</p>

					<h2 className="mt-4 text-3xl">{t("section-2-title")}</h2>
					<p className="mt-2">{t("section-2")}</p>

					<h2 className="mt-4 text-3xl">{t("section-3-title")}</h2>
					<p className="mt-2">{t("section-3")}</p>

					<h2 className="mt-4 text-3xl">{t("section-4-title")}</h2>
					<p className="mt-2">{t("section-4")}</p>

					<h2 className="mt-4 text-3xl">{t("section-5-title")}</h2>
					<p className="mt-2">{t("section-5-intro")}</p>
					<ul className="mt-2 list-inside list-disc">
						<li>{t("section-5-item-1")}</li>
						<li>{t("section-5-item-2")}</li>
						<li>{t("section-5-item-3")}</li>
						<li>{t("section-5-item-4")}</li>
					</ul>
					<p className="mt-2">{t("section-5-outro")}</p>

					<h2 className="mt-4 text-3xl">{t("section-6-title")}</h2>
					<p className="mt-2">{t("section-6")}</p>

					<h2 className="mt-4 text-3xl">{t("section-7-title")}</h2>
				</div>
			</div>
		</>
	);
}
