// Identity mark: the shirt number when set, otherwise initials. Yellow ring marks the viewer.
export function Jersey({
	number,
	name,
	image,
	size = 36,
	own = false,
}: {
	number: number | null;
	name: string | null;
	image?: string | null;
	size?: number;
	own?: boolean;
}) {
	const label =
		number ??
		(name ?? "")
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((w) => w[0]?.toUpperCase())
			.join("");
	const ring = own
		? "border-primary shadow-[inset_0_0_0_2px_var(--background),inset_0_0_0_3px_var(--primary)]"
		: "border-hair";
	if (image && number === null)
		return (
			<img
				src={image}
				alt=""
				width={size}
				height={size}
				className={`object-cover shrink-0 rounded-full border ${ring}`}
				style={{ width: size, height: size }}
			/>
		);
	return (
		<span
			aria-hidden="true"
			className={`grid shrink-0 place-items-center rounded-full border font-display font-normal bg-background text-foreground tabular-nums ${ring}`}
			style={{
				width: size,
				height: size,
				fontSize: number === null ? size * 0.32 : size * 0.42,
			}}
		>
			{label || "·"}
		</span>
	);
}
