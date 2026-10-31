import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "../../../../components/ui/button";
import {
	getAdminPage,
	getModerationDashboard,
	moderateReport,
} from "../lib/moderation";
import { AdminPageSchema, type DecisionInput } from "../lib/moderation-input";
import { moderationMessages } from "../lib/moderation-messages";
export const Route = createFileRoute("/$locale/admin")({
	validateSearch: (v) =>
		AdminPageSchema.parse({
			kind: v.kind ?? "reports",
			q: v.q ?? "",
			status: v.status ?? "PENDING",
			cursor: v.cursor ?? null,
		}),
	loaderDeps: ({ search }) => search,
	loader: async ({ deps }) => {
		const summary = await getModerationDashboard();
		if (!summary.ok) return { ok: false as const };
		const page = await getAdminPage({ data: deps });
		return page.ok
			? { ok: true as const, summary: summary.value, page: page.value }
			: { ok: false as const };
	},
	staleTime: 0,
	gcTime: 0,
	headers: () => ({ "Cache-Control": "private, no-store", Vary: "Cookie" }),
	component: Page,
});
function Page() {
	const result = Route.useLoaderData(),
		{ locale } = Route.useRouteContext(),
		search = Route.useSearch(),
		router = useRouter(),
		qc = useQueryClient(),
		t = moderationMessages[locale],
		[q, setQ] = useState(search.q);
	const decision = useMutation({
		mutationFn: async (data: DecisionInput) => {
			const r = await moderateReport({ data });
			if (!r.ok) throw new Error(r.error);
			return r.value;
		},
		onSuccess: async () => {
			// Cancel in-flight public reads before removing cached parents across both locales.
			await qc.cancelQueries();
			qc.clear();
			await router.invalidate();
		},
	});
	if (!result.ok)
		return (
			<section>
				<h1>{t.admin}</h1>
				<p role="alert">{t.denied}</p>
				<Link to="/$locale/feed" params={{ locale }}>
					{t.back}
				</Link>
			</section>
		);
	const { summary, page } = result;
	return (
		<section className="space-y-6">
			<h1 className="text-2xl font-semibold">{t.admin}</h1>
			<p>
				{t.users}: {summary.users} · {t.posts}: {summary.posts} · {t.pending}:{" "}
				{summary.pending}
			</p>
			<nav className="flex flex-wrap gap-4">
				<Link to="/$locale/feed" params={{ locale }}>
					{t.back}
				</Link>
				{(["users", "reports"] as const).map((kind) => (
					<Link
						key={kind}
						to="/$locale/admin"
						params={{ locale }}
						search={{ kind, q: "", status: "PENDING", cursor: null }}
					>
						{t[kind]}
					</Link>
				))}
				<Link
					to="/$locale/admin"
					params={{ locale: locale === "fr" ? "en" : "fr" }}
					search={search}
				>
					{locale === "fr" ? "English" : "Français"}
				</Link>
			</nav>
			<form
				className="flex flex-wrap gap-3"
				onSubmit={(e) => {
					e.preventDefault();
					void router.navigate({
						to: "/$locale/admin",
						params: { locale },
						search: { ...search, q, cursor: null },
					});
				}}
			>
				<label>
					{search.kind === "users" ? t.userSearch : t.reportSearch}
					<input
						className="ml-2 rounded border bg-background p-2"
						value={q}
						maxLength={search.kind === "reports" ? 36 : 128}
						onChange={(e) => setQ(e.target.value)}
					/>
				</label>
				<Button type="submit">{t.search}</Button>
			</form>
			{search.kind === "reports" && (
				<nav className="flex gap-4">
					{(["PENDING", "REVIEWED", "DISMISSED"] as const).map((status) => (
						<Link
							key={status}
							to="/$locale/admin"
							params={{ locale }}
							search={{ ...search, status, cursor: null }}
						>
							{status === "PENDING"
								? t.pending
								: status === "REVIEWED"
									? t.reviewed
									: t.dismissed}
						</Link>
					))}
				</nav>
			)}
			{decision.isError && (
				<p role="alert">
					{t.error}
					<Button onClick={() => router.invalidate()}>{t.search}</Button>
				</p>
			)}
			{page.users.map((u) => (
				<article key={u.id} className="rounded border p-4">
					<p>
						{u.name ?? u.id} · {u.userType}
					</p>
					<p>{u.id}</p>
				</article>
			))}
			{page.reports.map((r) => (
				<article key={r.id} className="space-y-3 rounded border p-4">
					<h2>{r.post?.title ?? t.missing}</h2>
					<p>
						{r.postId} · {r.userId}
					</p>
					<p>
						{t.reasons[r.reason]} · {r.status}
					</p>
					<p className="whitespace-pre-wrap">{r.details}</p>
					<time dateTime={r.createdAt}>
						{new Date(r.createdAt).toLocaleDateString(locale, {
							timeZone: "UTC",
						})}
					</time>
					{r.status === "PENDING" && r.post && (
						<div className="flex flex-wrap gap-3">
							{(["review", "dismiss", "reject"] as const).map((operation) => (
								<Button
									key={operation}
									disabled={decision.isPending}
									onClick={() =>
										decision.mutate({
											signalId: r.id,
											postId: r.postId,
											signalVersion: r.version,
											postVersion: r.post!.version,
											operation,
										})
									}
								>
									{t[operation]}
								</Button>
							))}
						</div>
					)}
				</article>
			))}
			{!page.users.length && !page.reports.length && <p>{t.empty}</p>}
			<nav className="flex gap-4">
				<Link
					to="/$locale/admin"
					params={{ locale }}
					search={{ ...search, cursor: null }}
				>
					{t.first}
				</Link>
				{page.nextCursor && (
					<Link
						to="/$locale/admin"
						params={{ locale }}
						search={{ ...search, cursor: page.nextCursor }}
					>
						{t.next}
					</Link>
				)}
			</nav>
		</section>
	);
}
