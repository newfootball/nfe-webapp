"use client";

import { Download, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
	prompt: () => Promise<void>;
	userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "nfe-pwa-install-dismissed";

export function InstallPrompt() {
	const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		if (
			window.matchMedia("(display-mode: standalone)").matches ||
			sessionStorage.getItem(DISMISSED_KEY)
		) {
			return;
		}

		const handler = (e: Event) => {
			e.preventDefault();
			setPrompt(e as BeforeInstallPromptEvent);
			setTimeout(() => setVisible(true), 3000);
		};

		window.addEventListener("beforeinstallprompt", handler);
		return () => window.removeEventListener("beforeinstallprompt", handler);
	}, []);

	const handleInstall = async () => {
		if (!prompt) return;
		await prompt.prompt();
		const { outcome } = await prompt.userChoice;
		if (outcome === "accepted") {
			setVisible(false);
		}
	};

	const handleDismiss = () => {
		setVisible(false);
		sessionStorage.setItem(DISMISSED_KEY, "1");
	};

	if (!visible) return null;

	return (
		<div className="fixed bottom-24 inset-x-4 z-50 mx-auto max-w-sm">
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
						Installer l'app
					</p>
					<p className="text-xs text-muted-foreground">
						Accès rapide depuis l'écran d'accueil
					</p>
				</div>
				<div className="flex items-center gap-1 shrink-0">
					<Button
						size="sm"
						onClick={handleInstall}
						className="h-8 px-3 text-xs"
					>
						<Download className="h-3.5 w-3.5 mr-1" />
						Installer
					</Button>
					<Button
						size="icon"
						variant="ghost"
						className="h-8 w-8"
						onClick={handleDismiss}
					>
						<X className="h-3.5 w-3.5" />
					</Button>
				</div>
			</div>
		</div>
	);
}
