import { useMutation, useQueryClient } from "@tanstack/react-query";
import { setFeatured } from "../../lib/home";
import { homeMessages } from "../../lib/home-messages";
import type { Locale } from "../../lib/messages";
import { Icon } from "./icon";

// Admin override of the automatic play of the week; null clears the pin.
export function PinButton({
	id,
	locale,
	className = "",
}: {
	id: string | null;
	locale: Locale;
	className?: string;
}) {
	const t = homeMessages[locale],
		client = useQueryClient();
	const pin = useMutation({
		mutationFn: async () => {
			const r = await setFeatured({ data: { id } });
			if (!r.ok) throw new Error(r.error);
		},
		onSettled: () => client.invalidateQueries({ queryKey: ["home"] }),
	});
	return (
		<button
			type="button"
			disabled={pin.isPending}
			onClick={() => pin.mutate()}
			className={`inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-[11.5px] font-medium transition hover:text-foreground disabled:opacity-50 ${className}`}
		>
			<Icon name="pin" className="size-4" />
			{id ? t.pin : t.unpin}
		</button>
	);
}
