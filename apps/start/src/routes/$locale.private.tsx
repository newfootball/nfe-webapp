import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { getAdmin, getPrivate, signOut, updateOwnName } from "../lib/auth";
import { clearIdentityCache } from "../lib/auth-cache";
import { authMessages } from "../lib/auth-messages";

export const Route = createFileRoute("/$locale/private")({
	loader: async ({ params }) => {
		const result = await getPrivate();
		if (!result.ok)
			throw redirect({
				to: "/$locale/sign-in",
				params: { locale: params.locale },
				search: { returnTo: `/${params.locale}/private` },
			});
		return result.value;
	},
	staleTime: 0,
	component: PrivatePage,
});
function PrivatePage() {
	const viewer = Route.useLoaderData();
	const { locale, queryClient } = Route.useRouteContext();
	const router = useRouter();
	const t = authMessages[locale];
	const [notice, setNotice] = useState("");
	async function refresh() {
		await clearIdentityCache(queryClient);
		await router.invalidate();
	}
	return (
		<section className="space-y-6">
			<h1 className="text-3xl font-bold">{t.private}</h1>
			<p data-testid="identity">{viewer.id}</p>
			<p data-testid="name">{viewer.name}</p>
			<p data-testid="role">{viewer.role}</p>
			<button
				type="button"
				onClick={async () => {
					try {
						const result = await signOut();
						if (!result.ok) {
							setNotice(t.errors[result.error]);
							return;
						}
						await refresh();
						await router.navigate({
							to: "/$locale/sign-in",
							params: { locale },
							search: { returnTo: "" },
						});
					} catch {
						setNotice(t.errors.unavailable);
					}
				}}
			>
				{t.signOut}
			</button>
			<form
				onSubmit={async (event) => {
					event.preventDefault();
					const fields = new FormData(event.currentTarget);
					try {
						const result = await updateOwnName({
							data: { name: String(fields.get("name")) },
						});
						if (!result.ok) {
							setNotice(t.errors[result.error]);
							await refresh();
							return;
						}
						await refresh();
					} catch {
						setNotice(t.errors.unavailable);
					}
				}}
			>
				<label>
					{t.name}
					<input
						className="border p-2"
						name="name"
						defaultValue={viewer.name}
						required
						maxLength={80}
					/>
				</label>
				<button type="submit">{t.save}</button>
			</form>
			<button
				type="button"
				onClick={async () => {
					try {
						const result = await getAdmin();
						setNotice(result.ok ? "admin" : t.errors[result.error]);
					} catch {
						setNotice(t.errors.unavailable);
					}
				}}
			>
				{t.admin}
			</button>
			{notice && <p role="status">{notice}</p>}
		</section>
	);
}
