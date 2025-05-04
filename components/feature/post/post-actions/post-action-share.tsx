"use client";

import { WhatsappIcon } from "@/components/icons/whatsapp";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { SiFacebook, SiInstagram, SiX } from "@icons-pack/react-simple-icons";
import { Copy, Share2 } from "lucide-react";
import { useState } from "react";

export const PostActionShare = ({ postId }: { postId: string }) => {
	const [isCopied, setIsCopied] = useState(false);
	const shareUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/post/${postId}`;

	const handleCopy = async () => {
		if (typeof navigator !== "undefined" && navigator.clipboard) {
			await navigator.clipboard.writeText(shareUrl);
			setIsCopied(true);
			setTimeout(() => setIsCopied(false), 1500);
		}
	};

	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button variant="ghost" size="sm" className="flex-1">
					<Share2 className="mr-2 h-4 w-4" />
					<span className="hidden md:inline">Partager</span>
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Partager ce post</DialogTitle>
					<DialogDescription>
						Choisissez une option pour partager ce post :
					</DialogDescription>
				</DialogHeader>
				<div className="flex flex-row gap-2 justify-center items-center mt-2">
					<Button
						onClick={handleCopy}
						variant="outline"
						size="icon"
						title="Copier le lien"
					>
						<Copy className="h-5 w-5" />
					</Button>
					<Button
						variant="outline"
						size="icon"
						onClick={() =>
							window.open(
								`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
								"_blank",
							)
						}
						title="Partager sur Facebook"
					>
						<SiFacebook className="h-5 w-5 text-[#1877F3]" />
					</Button>
					<Button
						variant="outline"
						size="icon"
						onClick={() =>
							window.open(
								`https://www.instagram.com/?url=${encodeURIComponent(shareUrl)}`,
								"_blank",
							)
						}
						title="Partager sur Instagram"
					>
						<SiInstagram className="h-5 w-5 text-[#E4405F]" />
					</Button>
					<Button
						variant="outline"
						size="icon"
						onClick={() =>
							window.open(
								`https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}`,
								"_blank",
							)
						}
						title="Partager sur X"
					>
						<SiX className="h-5 w-5 text-black" />
					</Button>
					<Button
						variant="outline"
						size="icon"
						onClick={() =>
							window.open(
								`https://wa.me/?text=${encodeURIComponent(shareUrl)}`,
								"_blank",
							)
						}
						title="Partager sur WhatsApp"
					>
						<WhatsappIcon />
					</Button>
				</div>
				{isCopied && (
					<p className="text-center text-green-600 text-xs mt-2">
						Lien copié !
					</p>
				)}
				<DialogClose asChild>
					<Button variant="secondary" className="mt-4 w-full">
						Fermer
					</Button>
				</DialogClose>
			</DialogContent>
		</Dialog>
	);
};
