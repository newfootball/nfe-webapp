import { ArrowLeftIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Image from "next/image";
import Link from "next/link";

export default async function notFound() {
	const t = await getTranslations("not-found");

	return (
		<div className="flex flex-col items-center justify-center h-screen text-gray-500">
			<Image
				src="/logo.svg"
				alt="Not Found"
				width={100}
				height={100}
				className="size-30 mb-4 opacity-50"
			/>

			<h1 className="text-4xl font-bold mb-2">{t("not-found")}</h1>
			<p className="text-lg mb-4">{t("not-found-description")}</p>

			<Link
				href="/"
				className="text-yellow-500 hover:text-yellow-600 mt-4 flex items-center gap-2"
			>
				<ArrowLeftIcon className="w-4 h-4" />
				{t("go-back-to-home")}
			</Link>
		</div>
	);
}
