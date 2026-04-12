"use client";

import { Download, X } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
	prompt: () => Promise<void>;
	userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "nfe-pwa-install-dismissed";

export function InstallPrompt() {
	const t = useTranslations("pwa.install");
	const [deferredPrompt, setDeferredPrompt] =
		useState<BeforeInstallPromptEvent | null>(null);
	const [visible, setVisible] = useState(false);
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		if (
			window.matchMedia("(display-mode: standalone)").matches ||
			sessionStorage.getItem(DISMISSED_KEY)
		) {
			return;
		}

		const handler = (e: Event) => {
			e.preventDefault();
			setDeferredPrompt(e as BeforeInstallPromptEvent);
			timeoutRef.current = setTimeout(() => setVisible(true), 3000);
		};

		window.addEventListener("beforeinstallprompt", handler);
		return () => {
			window.removeEventListener("beforeinstallprompt", handler);
			if (timeoutRef.current) clearTimeout(timeoutRef.current);
		};
	}, []);

	const handleInstall = async () => {
		if (!deferredPrompt) return;
		try {
			await deferredPrompt.prompt();
			const { outcome } = await deferredPrompt.userChoice;
			if (outcome === "dismissed") {
				sessionStorage.setItem(DISMISSED_KEY, "1");
			}
		} catch {
			// prompt may already have been used
		} finally {
			setVisible(false);
			setDeferredPrompt(null);
		}
	};

	const handleDismiss = () => {
		setVisible(false);
		sessionStorage.setItem(DISMISSED_KEY, "1");
	};

	if (!visible) return null;

	return (
		<div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4">
			<div className="bg-background border border-border rounded-2xl shadow-lg p-4 flex items-center gap-3 animate-in slide-in-from-bottom-4 duration-300">
				<Image
					src="/icons/96.png"
					alt="NFE"
					width={44}
					height={44}
					className="rounded-xl shrink-0"
				/>
				<div className="flex-1 min-w-0">
					<p className="text-sm font-semibold leading-none mb-0.5">
						{t("title")}
					</p>
					<p className="text-xs text-muted-foreground">{t("description")}</p>
				</div>
				<div className="flex items-center gap-1 shrink-0">
					<Button
						size="sm"
						onClick={handleInstall}
						className="h-8 px-3 text-xs"
					>
						<Download className="h-3.5 w-3.5 mr-1" />
						{t("action")}
					</Button>
					<Button
						size="icon"
						variant="ghost"
						className="h-8 w-8"
						onClick={handleDismiss}
						aria-label={t("dismiss")}
					>
						<X className="h-3.5 w-3.5" />
					</Button>
				</div>
			</div>
		</div>
	);
}
