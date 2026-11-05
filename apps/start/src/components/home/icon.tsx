const PATHS = {
	ball: [
		"M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z",
		"m12 7.5 4 2.9-1.5 4.7h-5L8 10.4z",
		"M12 3v4.5M16 10.4l4.4-1.6M14.5 15.1l2.7 3.9M9.5 15.1l-2.7 3.9M8 10.4 3.6 8.8",
	],
	heart: [
		"M12 19.5s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 7.5 2.5c0 5.4-7.5 10-7.5 10z",
	],
	comment: [
		"M20.5 12a8.5 8.5 0 0 1-12.3 7.6L3.5 20.5l.9-4.4A8.5 8.5 0 1 1 20.5 12z",
	],
	save: ["M6.5 3.5h11v17l-5.5-3.8-5.5 3.8z"],
	plus: ["M12 5v14M5 12h14"],
	pin: ["M9 3.5h6l-1 6 3.5 3.5h-11L10 9.5zM12 13v7.5"],
	arrow: ["M5 12h14M13 6l6 6-6 6"],
	bell: [
		"M6 9a6 6 0 0 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9",
		"M10 19a2 2 0 0 0 4 0",
	],
} as const;
export type IconName = keyof typeof PATHS;
export function Icon({
	name,
	className = "size-5",
	strokeWidth = 1.25,
}: {
	name: IconName;
	className?: string;
	strokeWidth?: number;
}) {
	return (
		<svg
			viewBox="0 0 24 24"
			aria-hidden="true"
			className={`icon shrink-0 ${className}`}
			style={{ strokeWidth }}
		>
			{PATHS[name].map((d) => (
				<path key={d} d={d} />
			))}
		</svg>
	);
}
