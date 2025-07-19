"use client";

import { Button } from "@/components/ui/button";
import { ArrowLeftIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { useEffect } from "react";

export default function ErrorPage({
	error,
	reset,
}: {
	error: Error;
	reset: () => void;
}) {
	const t = useTranslations("error");

	useEffect(() => {
		// Log the error to an error reporting service
		console.error(error);
	}, [error]);

	return (
		<div className="flex flex-col items-center justify-center h-screen text-gray-500">
			<Image
				src="/logo.svg"
				alt="Not Found"
				width={100}
				height={100}
				className="size-30 mb-4 opacity-50"
			/>

			<h1 className="text-4xl font-bold mb-2">{t("error")}</h1>
			<p className="text-lg mb-4">{t("error-description")}</p>

			<Button onClick={reset} variant="outline" className="mt-4">
				{t("try-again")}
			</Button>

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
