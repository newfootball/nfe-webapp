import { Link } from "@tanstack/react-router";
import { feedMessages } from "../../lib/feed-messages";
import type { Locale } from "../../lib/messages";
export function FeedNav({
	locale,
	page,
	id,
	q = "",
	tab = "top",
}: {
	locale: Locale;
	page: "home" | "feed" | "user" | "post" | "explore";
	id?: string;
	q?: string;
	tab?: "top" | "users" | "posts";
}) {
	const other = locale === "fr" ? "en" : "fr",
		label = locale === "fr" ? "English" : "Français";
	return (
		<nav
			aria-label={
				locale === "fr" ? "Publications et recherche" : "Posts and search"
			}
			className="mb-8 flex flex-wrap gap-6 text-sm underline"
		>
			<Link to="/$locale/feed" params={{ locale }}>
				{feedMessages[locale].feed}
			</Link>
			<Link
				to="/$locale/explore"
				params={{ locale }}
				search={{ q: "", tab: "top" }}
			>
				{feedMessages[locale].explore}
			</Link>
			<Link
				to="/$locale/admin"
				params={{ locale }}
				search={{ kind: "reports", q: "", status: "PENDING", cursor: null }}
			>
				{locale === "fr" ? "Administration" : "Administration"}
			</Link>
			{page === "post" && id ? (
				<Link to="/$locale/post/$id" params={{ locale: other, id }}>
					{label}
				</Link>
			) : page === "user" && id ? (
				<Link to="/$locale/user/$id" params={{ locale: other, id }}>
					{label}
				</Link>
			) : page === "explore" ? (
				<Link
					to="/$locale/explore"
					params={{ locale: other }}
					search={{ q, tab }}
				>
					{label}
				</Link>
			) : (
				<Link to="/$locale/feed" params={{ locale: other }}>
					{label}
				</Link>
			)}
		</nav>
	);
}
