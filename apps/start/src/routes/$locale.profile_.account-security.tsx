import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { profileMessages } from "../lib/profile-messages";
import { getVerification } from "../lib/recovery";
import { recoveryMessages } from "../lib/recovery-messages";
export const Route = createFileRoute("/$locale/profile_/account-security")({
	loader: async ({ params }) => {
		const r = await getVerification();
		if (!r.ok) {
			if (r.error === "unauthorized")
				throw redirect({
					to: "/$locale/sign-in",
					params: { locale: params.locale },
					search: { returnTo: `/${params.locale}/profile/account-security` },
				});
			throw new Error("Profile unavailable");
		}
		return { email: r.value.email };
	},
	staleTime: 0,
	gcTime: 0,
	component: Page,
});
function Page() {
	const { email } = Route.useLoaderData();
	const { locale } = Route.useRouteContext();
	const t = profileMessages[locale];
	const access = recoveryMessages[locale];
	return (
		<section className="space-y-6">
			<h1 className="text-3xl font-bold">{t.security}</h1>
			<label>
				{t.email}
				<input
					className="block rounded border p-2"
					value={email}
					readOnly
					type="email"
				/>
			</label>
			<p>{t.emailReadonly}</p>
			<nav className="flex flex-col gap-3">
				<Link
					to="/$locale/recovery"
					params={{ locale }}
					search={{ flow: "change" }}
				>
					{access.change}
				</Link>
				<Link
					to="/$locale/recovery"
					params={{ locale }}
					search={{ flow: "settings" }}
				>
					{access.verify}
				</Link>
				<Link
					to="/$locale/recovery"
					params={{ locale }}
					search={{ flow: "forgot" }}
				>
					{access.forgot}
				</Link>
			</nav>
		</section>
	);
}
