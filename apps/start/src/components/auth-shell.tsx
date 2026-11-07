import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/utils";

export function AuthShell({
	eyebrow,
	title,
	lead,
	children,
}: {
	eyebrow: string;
	title: string;
	lead?: ReactNode;
	children: ReactNode;
}) {
	return (
		<section className="w-full max-w-sm mx-auto">
			<header className="overflow-hidden relative flex flex-col justify-end h-36 rounded-lg px-5 pb-4 text-white pitch">
				<span
					aria-hidden="true"
					className="absolute inset-0 bg-[linear-gradient(180deg,transparent_30%,rgb(0_0_0/0.6))]"
				/>
				<img
					src="/logo-mark.png"
					alt=""
					width={30}
					height={30}
					className="absolute top-4 left-5 size-[30px]"
				/>
				<p className="relative mb-2 font-label tracking-[0.22em] uppercase text-[10px] text-white/75">
					{eyebrow}
				</p>
				<h1 className="relative font-display font-semibold leading-none uppercase text-[34px] [text-shadow:0_1px_12px_rgb(0_0_0/0.45)]">
					{title}
				</h1>
			</header>
			{lead && (
				<p className="mt-4 leading-relaxed text-[14px] text-muted-foreground">
					{lead}
				</p>
			)}
			<div className="flex flex-col gap-5 mt-6">{children}</div>
		</section>
	);
}

export function Field({
	label,
	aside,
	className,
	...input
}: InputHTMLAttributes<HTMLInputElement> & {
	label: string;
	aside?: ReactNode;
}) {
	return (
		<div className="flex flex-col gap-1.5">
			<div className="flex items-baseline justify-between gap-3">
				<label
					htmlFor={input.name}
					className="font-medium text-[12.5px] text-foreground/80"
				>
					{label}
				</label>
				{aside}
			</div>
			<input
				id={input.name}
				className={cn(
					"h-11 w-full rounded-[10px] border border-hair bg-transparent px-3 text-[15px] transition-colors outline-none placeholder:text-muted-foreground/60 focus:border-foreground",
					className,
				)}
				{...input}
			/>
		</div>
	);
}

export function Divider({ label }: { label: string }) {
	return (
		<div className="flex items-center gap-3 tracking-[0.18em] uppercase text-[11px] text-muted-foreground">
			<span className="flex-1 h-px bg-hair" />
			{label}
			<span className="flex-1 h-px bg-hair" />
		</div>
	);
}

export function Notice({
	tone = "info",
	children,
}: {
	tone?: "info" | "alert";
	children: ReactNode;
}) {
	return (
		<p
			role={tone === "alert" ? "alert" : "status"}
			className={cn(
				"border-l-2 pl-3 text-[13.5px] leading-relaxed",
				tone === "alert" ? "border-destructive" : "border-primary",
			)}
		>
			{children}
		</p>
	);
}

export function GoogleMark() {
	return (
		<svg viewBox="0 0 24 24" aria-hidden="true">
			<path
				fill="#4285F4"
				d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09Z"
			/>
			<path
				fill="#34A853"
				d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
			/>
			<path
				fill="#FBBC05"
				d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z"
			/>
			<path
				fill="#EA4335"
				d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.96 10.96 0 0 0 12 1 11 11 0 0 0 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
			/>
		</svg>
	);
}
