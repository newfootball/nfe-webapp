"use client";

import { WifiOff } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

export default function OfflinePage() {
	const router = useRouter();
	const t = useTranslations("pwa.offline");
	const [reconnected, setReconnected] = useState(false);
	const firedRef = useRef(false);

	const goHome = () => {
		if (typeof window !== "undefined" && window.history.length > 1) {
			router.back();
		} else {
			router.replace("/");
		}
	};

	useEffect(() => {
		const handleOnline = () => {
			if (firedRef.current) return;
			firedRef.current = true;
			setReconnected(true);
			setTimeout(() => {
				if (typeof window !== "undefined" && window.history.length > 1) {
					router.back();
				} else {
					router.replace("/");
				}
			}, 800);
		};

		window.addEventListener("online", handleOnline);
		return () => window.removeEventListener("online", handleOnline);
	}, [router]);

	return (
		<div className="min-h-screen flex flex-col items-center justify-center gap-8 px-6 bg-background">
			<Image
				src="/logo.svg"
				alt="NFE"
				width={80}
				height={80}
				className="opacity-80"
				priority
			/>

			<div className="flex flex-col items-center gap-3 text-center">
				<div className="rounded-full bg-muted p-4">
					<WifiOff className="h-8 w-8 text-muted-foreground" />
				</div>
				<h1 className="text-xl font-semibold">{t("title")}</h1>
				<p className="text-sm text-muted-foreground max-w-xs">
					{t("description")}
				</p>
			</div>

			{reconnected && (
				<p className="text-sm text-primary font-medium animate-pulse">
					{t("reconnected")}
				</p>
			)}

			<Button onClick={goHome} variant="outline" className="min-w-40">
				{t("retry")}
			</Button>
		</div>
	);
}
