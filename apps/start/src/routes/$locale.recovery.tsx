import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { clearIdentityCache } from "../lib/auth-cache";
import {
	forgotPassword,
	getVerification,
	resetPassword,
	sendVerification,
	updatePassword,
	verifyEmail,
} from "../lib/recovery";
import { recoveryMessages } from "../lib/recovery-messages";
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
		<section className="max-w-md space-y-5">
			<h1 className="text-3xl font-bold">{t.title}</h1>
			{status.ok && <p>{status.value.verified ? t.verified : t.unverified}</p>}
			<p>{t.challenge}</p>
			{flow === "invalid" ? (
				<p role="alert">{t.failed}</p>
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
					<h2>
						{flow === "reset"
							? t.reset
							: flow === "change"
								? t.change
								: flow === "verify" || isSettings
									? t.verify
									: t.forgot}
					</h2>
					{flow === "forgot" && (
						<label>
							{t.email}
							<input
								className="block border p-2"
								type="email"
								name="email"
								autoComplete="email"
								maxLength={254}
								required
							/>
						</label>
					)}
					{flow === "change" && (
						<label>
							{t.oldPassword}
							<input
								className="block border p-2"
								type="password"
								name="oldPassword"
								autoComplete="current-password"
								minLength={8}
								maxLength={256}
								required
							/>
						</label>
					)}
					{(flow === "change" || flow === "reset") && (
						<label>
							{t.password}
							<input
								className="block border p-2"
								type="password"
								name="password"
								autoComplete="new-password"
								minLength={8}
								maxLength={256}
								required
							/>
						</label>
					)}
					<button type="submit" className="rounded border p-2" disabled={busy}>
						{flow === "forgot" || isSettings ? t.send : t.confirm}
					</button>
				</form>
			)}
			{message && <p role="status">{message}</p>}
			<nav className="flex flex-col gap-2">
				<Link
					to="/$locale/recovery"
					params={{ locale }}
					search={{ flow: "forgot" }}
				>
					{t.forgot}
				</Link>
				<Link
					to="/$locale/recovery"
					params={{ locale }}
					search={{ flow: "change" }}
				>
					{t.change}
				</Link>
				<Link
					to="/$locale/recovery"
					params={{ locale }}
					search={{ flow: "settings" }}
				>
					{t.verify}
				</Link>
				<Link
					to="/$locale/sign-in"
					params={{ locale }}
					search={{ returnTo: "" }}
				>
					{t.signIn}
				</Link>
			</nav>
		</section>
	);
}
