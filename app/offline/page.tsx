"use client";

import { WifiOff } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export default function OfflinePage() {
	const router = useRouter();
	const [isOnline, setIsOnline] = useState(false);

	useEffect(() => {
		const handleOnline = () => {
			setIsOnline(true);
			setTimeout(() => router.back(), 800);
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
				<h1 className="text-xl font-semibold">Vous êtes hors ligne</h1>
				<p className="text-sm text-muted-foreground max-w-xs">
					Vérifiez votre connexion internet et réessayez.
				</p>
			</div>

			{isOnline && (
				<p className="text-sm text-primary font-medium animate-pulse">
					Connexion rétablie — redirection...
				</p>
			)}

			<Button
				onClick={() => router.back()}
				variant="outline"
				className="min-w-[160px]"
			>
				Réessayer
			</Button>
		</div>
	);
}
