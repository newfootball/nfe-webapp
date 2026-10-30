import type { getDirectory } from "../../lib/directory";
import { directoryLabels } from "../../lib/directory-input";
import { PublicPageLayout } from "./layout";
export function DirectoryPage({
	data,
	title,
	page,
}: {
	data: Awaited<ReturnType<typeof getDirectory>>;
	title: string;
	page: number;
}) {
	const t = directoryLabels[data.locale];
	return (
		<main>
			<PublicPageLayout locale={data.locale} title={title}>
				{data.users.length ? (
					<ul className="grid gap-6 sm:grid-cols-2">
						{data.users.map((user) => (
							<li key={user.id}>
								<a
									className="underline"
									href={`/user/${encodeURIComponent(user.id)}`}
								>
									<h2>
										{user.name ?? (data.locale === "fr" ? "Profil" : "Profile")}
									</h2>
								</a>
								<p>{user.localisation}</p>
							</li>
						))}
					</ul>
				) : (
					<p>{t.empty}</p>
				)}
				<nav aria-label="Pagination" className="flex gap-6">
					{page > 1 && <a href={`?page=${page - 1}`}>{t.previous}</a>}
					{data.hasNext && page < 50 && (
						<a href={`?page=${page + 1}`}>{t.next}</a>
					)}
				</nav>
			</PublicPageLayout>
		</main>
	);
}
