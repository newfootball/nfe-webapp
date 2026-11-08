import type { QueryClient } from "@tanstack/react-query";
import { Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { signIn, signUp } from "../lib/auth";
import { clearIdentityCache } from "../lib/auth-cache";
import { authMessages } from "../lib/auth-messages";
import { safeReturnPath } from "../lib/auth-policy";
import type { Locale } from "../lib/messages";
import { recoveryMessages } from "../lib/recovery-messages";
import { cn } from "../lib/utils";
import { AuthShell, Divider, Field, GoogleMark, Notice } from "./auth-shell";
import { buttonVariants } from "./ui/button";

export function AuthForm({
	locale,
	queryClient,
	returnTo = "",
	oauth,
	google = false,
	initialSignup = false,
}: {
	locale: Locale;
	queryClient: QueryClient;
	returnTo?: string;
	oauth?: string;
	google?: boolean;
	initialSignup?: boolean;
}) {
	const router = useRouter();
	const t = authMessages[locale];
	const [signup, setSignup] = useState(initialSignup);
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	const [hydrated, setHydrated] = useState(false);
	useEffect(() => setHydrated(true), []);
	return (
		<AuthShell
			eyebrow={t.eyebrow}
			title={signup ? t.signUp : t.signIn}
			lead={signup ? t.signUpLead : t.signInLead}
		>
			{oauth && <Notice tone="alert">{recoveryMessages[locale].failed}</Notice>}
			{google && (
				<>
					<form method="post" action="/oauth/google">
						<input type="hidden" name="locale" value={locale} />
						<button
							className={cn(
								buttonVariants({ variant: "outline", size: "lg" }),
								"w-full h-11",
							)}
							type="submit"
						>
							<GoogleMark />
							{recoveryMessages[locale].google}
						</button>
					</form>
					<Divider label={t.or} />
				</>
			)}
			<form
				method="post"
				className="flex flex-col gap-4"
				onSubmit={async (event) => {
					event.preventDefault();
					setBusy(true);
					setError("");
					const fields = new FormData(event.currentTarget);
					const data = {
						email: String(fields.get("email")),
						password: String(fields.get("password")),
					};
					try {
						const result = signup
							? await signUp({
									data: { ...data, name: String(fields.get("name") ?? "") },
								})
							: await signIn({ data });
						if (!result.ok) {
							setError(t.errors[result.error]);
							return;
						}
						await clearIdentityCache(queryClient);
						await router.invalidate();
						await router.navigate({ to: safeReturnPath(returnTo, locale) });
					} catch {
						setError(t.errors.unavailable);
					} finally {
						setBusy(false);
					}
				}}
			>
				{signup && (
					<Field
						label={t.name}
						name="name"
						autoComplete="name"
						required
						maxLength={80}
					/>
				)}
				<Field
					label={t.email}
					name="email"
					type="email"
					autoComplete="email"
					required
					maxLength={254}
				/>
				<Field
					label={t.password}
					name="password"
					type="password"
					autoComplete={signup ? "new-password" : "current-password"}
					required
					minLength={8}
					maxLength={256}
					aside={
						!signup && (
							<Link
								to="/$locale/recovery"
								params={{ locale }}
								search={{ flow: "forgot" }}
								className="text-[12px] text-muted-foreground transition-colors hover:text-foreground"
							>
								{recoveryMessages[locale].forgot}
							</Link>
						)
					}
				/>
				{error && <Notice tone="alert">{error}</Notice>}
				<button
					className={cn(buttonVariants({ size: "lg" }), "w-full h-11 mt-1")}
					disabled={busy || !hydrated}
					type="submit"
				>
					{signup ? t.signUp : t.signIn}
				</button>
			</form>
			<p className="flex items-center justify-center gap-2 border-t border-hair pt-5 text-[13px] text-muted-foreground">
				{signup ? t.haveAccount : t.noAccount}
				<button
					type="button"
					className={buttonVariants({ variant: "link", size: "inline" })}
					onClick={() => {
						setSignup(!signup);
						setError("");
					}}
				>
					{signup ? t.signIn : t.signUp}
				</button>
			</p>
			<Link
				to="/$locale/private"
				params={{ locale }}
				className="self-center text-[12px] text-muted-foreground transition-colors hover:text-foreground"
			>
				{t.private}
			</Link>
		</AuthShell>
	);
}
