import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowLeft, MoreHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";

export const PageHeader = ({
	title,
	backLink,
}: {
	title: string;
	backLink: string;
}) => {
	const t = useTranslations("feature.page-header");

	return (
		<header className="sticky top-0 z-40 w-full bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
			<div className="flex items-center justify-between h-14">
				{backLink && (
					<Link
						href={backLink}
						className={cn(buttonVariants({ variant: "ghost" }))}
						title={t("go-back")}
					>
						<ArrowLeft className="h-5 w-5" />
					</Link>
				)}
				<h1 className="text-lg font-semibold">{title}</h1>
				<Button variant="ghost" size="icon" title={t("more-options")}>
					<MoreHorizontal className="h-6 w-6" />
				</Button>
			</div>
		</header>
	);
};
