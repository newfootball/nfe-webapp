import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { AuthShell, Field, Notice } from "../components/auth-shell";
import { buttonVariants } from "../components/ui/button";
import { clearIdentityCache } from "../lib/auth-cache";
import { authMessages } from "../lib/auth-messages";
import {
	forgotPassword,
	getVerification,
	resetPassword,
	sendVerification,
	updatePassword,
	verifyEmail,
} from "../lib/recovery";
import { recoveryMessages } from "../lib/recovery-messages";
import { cn } from "../lib/utils";

const recoveryLink =
	"flex items-center justify-between border-b border-hair py-3 text-foreground/85 transition-colors hover:text-foreground after:text-muted-foreground after:content-['→']";
export const Route = createFileRoute("/$locale/recovery")({
	validateSearch: (input: Record<string, unknown>) => ({
		flow: ["reset", "verify", "change", "settings", "invalid"].includes(
			String(input.flow),
		)
			? String(input.flow)
			: "forgot",
	}),
	loader: () => getVerification(),
	component: RecoveryPage,
});
function RecoveryPage() {
	const { locale, queryClient } = Route.useRouteContext();
	const { flow } = Route.useSearch();
	const status = Route.useLoaderData();
	const router = useRouter();
	const t = recoveryMessages[locale];
	const [message, setMessage] = useState("");
	const [busy, setBusy] = useState(false);
	const isSettings = flow === "settings";
	return (
		<AuthShell
			eyebrow={authMessages[locale].eyebrow}
			title={t.title}
			lead={t.challenge}
		>
			{status.ok && (
				<p className="flex items-center gap-2 text-[13px]">
					<span
						aria-hidden="true"
						className={cn(
							"size-1.5 rounded-full",
							status.value.verified ? "bg-primary" : "bg-muted-foreground/50",
						)}
					/>
					<span>{status.value.verified ? t.verified : t.unverified}</span>
				</p>
			)}
			{flow === "invalid" ? (
				<Notice tone="alert">{t.failed}</Notice>
			) : (
				<form
					className="flex flex-col gap-4"
					onSubmit={async (event) => {
						event.preventDefault();
						const form = event.currentTarget;
						const fields = new FormData(form);
						setBusy(true);
						setMessage("");
						try {
							const result =
								flow === "reset"
									? await resetPassword({
											data: {
												locale,
												password: String(fields.get("password")),
											},
										})
									: flow === "verify"
										? await verifyEmail({ data: { locale } })
										: flow === "change"
											? await updatePassword({
													data: {
														locale,
														oldPassword: String(fields.get("oldPassword")),
														password: String(fields.get("password")),
													},
												})
											: isSettings
												? await sendVerification({ data: { locale } })
												: await forgotPassword({
														data: {
															locale,
															email: String(fields.get("email")),
														},
													});
							setMessage(
								result.ok
									? flow === "forgot" || isSettings
										? t.requested
										: t.updated
									: t.failed,
							);
							if (result.ok) {
								form.reset();
								await clearIdentityCache(queryClient);
								await router.invalidate();
							}
						} catch {
							setMessage(t.failed);
						} finally {
							setBusy(false);
						}
					}}
				>
					<h2 className="font-display font-medium tracking-[0.02em] uppercase text-[19px]">
						{flow === "reset"
							? t.reset
							: flow === "change"
								? t.change
								: flow === "verify" || isSettings
									? t.verify
									: t.forgot}
					</h2>
					{flow === "forgot" && (
						<Field
							label={t.email}
							type="email"
							name="email"
							autoComplete="email"
							maxLength={254}
							required
						/>
					)}
					{flow === "change" && (
						<Field
							label={t.oldPassword}
							type="password"
							name="oldPassword"
							autoComplete="current-password"
							minLength={8}
							maxLength={256}
							required
						/>
					)}
					{(flow === "change" || flow === "reset") && (
						<Field
							label={t.password}
							type="password"
							name="password"
							autoComplete="new-password"
							minLength={8}
							maxLength={256}
							required
						/>
					)}
					<button
						type="submit"
						className={cn(buttonVariants({ size: "lg" }), "w-full h-11 mt-1")}
						disabled={busy}
					>
						{flow === "forgot" || isSettings ? t.send : t.confirm}
					</button>
				</form>
			)}
			{message && <Notice>{message}</Notice>}
			<nav className="flex flex-col border-t border-hair text-[13.5px]">
				<Link
					to="/$locale/recovery"
					params={{ locale }}
					search={{ flow: "forgot" }}
					className={recoveryLink}
				>
					{t.forgot}
				</Link>
				<Link
					to="/$locale/recovery"
					params={{ locale }}
					search={{ flow: "change" }}
					className={recoveryLink}
				>
					{t.change}
				</Link>
				<Link
					to="/$locale/recovery"
					params={{ locale }}
					search={{ flow: "settings" }}
					className={recoveryLink}
				>
					{t.verify}
				</Link>
				<Link
					to="/$locale/sign-in"
					params={{ locale }}
					search={{ returnTo: "" }}
					className={recoveryLink}
				>
					{t.signIn}
				</Link>
			</nav>
		</AuthShell>
	);
}
