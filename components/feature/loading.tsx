import { Loader } from "lucide-react";
import { useTranslations } from "next-intl";

export const Loading = () => {
	const t = useTranslations("feature.loading");

	return (
		<div className="flex justify-center items-center h-screen">
			<Loader className="animate-spin" />
			<span className="ml-2">{t("loading")}</span>
		</div>
	);
};
