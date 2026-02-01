"use client";

import { SiFacebook, SiInstagram, SiX } from "@icons-pack/react-simple-icons";
import { Copy, Share2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
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

export const PostActionShare = ({ postId }: { postId: string }) => {
	const t = useTranslations("posts.post-actions.share");

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
					<span className="hidden md:inline">{t("share-label")}</span>
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t("share-post")}</DialogTitle>
					<DialogDescription>{t("share-post-description")}</DialogDescription>
				</DialogHeader>
				<div className="flex flex-row gap-2 justify-center items-center mt-2">
					<Button
						onClick={handleCopy}
						variant="outline"
						size="icon"
						title={t("copy-link")}
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
						title={t("share-on-facebook")}
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
						title={t("share-on-instagram")}
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
						title={t("share-on-whatsapp")}
					>
						<WhatsappIcon />
					</Button>
				</div>
				{isCopied && (
					<p className="text-center text-green-600 text-xs mt-2">
						{t("link-copied")}
					</p>
				)}
				<DialogClose asChild>
					<Button variant="secondary" className="mt-4 w-full">
						{t("close")}
					</Button>
				</DialogClose>
			</DialogContent>
		</Dialog>
	);
};
