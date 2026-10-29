import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { signIn, signUp } from "../lib/auth";
import { clearIdentityCache } from "../lib/auth-cache";
import { authMessages } from "../lib/auth-messages";
import { safeReturnPath } from "../lib/auth-policy";

export const Route = createFileRoute("/$locale/sign-in")({
	validateSearch: (search: Record<string, unknown>) => ({
		returnTo: typeof search.returnTo === "string" ? search.returnTo : "",
	}),
	component: AuthPage,
});
function AuthPage() {
	const { locale, queryClient } = Route.useRouteContext();
	const { returnTo } = Route.useSearch();
	const router = useRouter();
	const t = authMessages[locale];
	const [signup, setSignup] = useState(false);
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	return (
		<section className="max-w-md space-y-6">
			<h1 className="text-3xl font-bold">{signup ? t.signUp : t.signIn}</h1>
			<form
				className="flex flex-col gap-4"
				onSubmit={async (event) => {
					event.preventDefault();
					setBusy(true);
					setError("");
					const fields = new FormData(event.currentTarget);
					const data = {
						email: String(fields.get("email")),
						password: String(fields.get("password")),
						name: String(fields.get("name") ?? ""),
					};
					try {
						const result = signup
							? await signUp({ data })
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
					<label>
						{t.name}
						<input
							className="block border p-2"
							name="name"
							autoComplete="name"
							required
							maxLength={80}
						/>
					</label>
				)}
				<label>
					{t.email}
					<input
						className="block border p-2"
						name="email"
						type="email"
						autoComplete="email"
						required
						maxLength={254}
					/>
				</label>
				<label>
					{t.password}
					<input
						className="block border p-2"
						name="password"
						type="password"
						autoComplete={signup ? "new-password" : "current-password"}
						required
						minLength={8}
						maxLength={256}
					/>
				</label>
				{error && <p role="alert">{error}</p>}
				<button className="rounded border p-2" disabled={busy} type="submit">
					{signup ? t.signUp : t.signIn}
				</button>
			</form>
			<button
				type="button"
				onClick={() => {
					setSignup(!signup);
					setError("");
				}}
			>
				{signup ? t.signIn : t.signUp}
			</button>
			<Link to="/$locale/private" params={{ locale }}>
				{t.private}
			</Link>
		</section>
	);
}
