"use client";

import { setCookie } from "cookies-next";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const SPLASH_IMAGES = [
	"https://images.unsplash.com/photo-1579952363873-27f3bade9f55?q=80&w=1920",
	"https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?q=80&w=1920",
	"https://images.unsplash.com/photo-1517466787929-bc90951d0974?q=80&w=1920",
];

export default function SplashPage() {
	const [currentImage, setCurrentImage] = useState(0);
	const router = useRouter();
	const t = useTranslations("splash");

	useEffect(() => {
		const interval = setInterval(() => {
			setCurrentImage((prev) => (prev + 1) % SPLASH_IMAGES.length);
		}, 3000);

		const timeout = setTimeout(() => {
			setCookie("seen_splash", "true", { maxAge: 60 * 60 * 24 * 365 }); // 1 year
			router.push("/");
		}, 10000);

		return () => {
			clearInterval(interval);
			clearTimeout(timeout);
		};
	}, [router]);

	return (
		<div className="fixed inset-0 bg-black">
			<div className="relative h-full w-full">
				{SPLASH_IMAGES.map((src, index) => (
					<Image
						key={src}
						src={src}
						alt={`Splash image ${index + 1}`}
						fill
						className={`object-cover transition-opacity duration-1000 ${
							currentImage === index ? "opacity-100" : "opacity-0"
						}`}
						priority
					/>
				))}
				<div className="absolute inset-0 bg-black/50" />
				<div className="absolute inset-0 flex flex-col items-center justify-center gap-6">
					<Image
						src="/logo.svg"
						alt="Logo"
						width={152}
						height={152}
						className="z-10"
						priority
					/>
					<h1 className="text-4xl font-bold text-center text-white">
						{t("title")}
					</h1>
					<small className="text-gray-300">
						{t("new-way-to-experience-football")}
					</small>
					<Link href="/">
						<Button>{t("get-started")}</Button>
					</Link>
				</div>
			</div>
		</div>
	);
}
