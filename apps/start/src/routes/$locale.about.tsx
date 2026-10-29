import { createFileRoute } from "@tanstack/react-router";
import { messages } from "../lib/messages";
export const Route = createFileRoute("/$locale/about")({ component: About });
function About() {
	const { locale } = Route.useRouteContext();
	const t = messages[locale];
	return (
		<>
			<h1 className="mb-6 text-4xl font-bold">{t.aboutTitle}</h1>
			<p>{t.aboutText}</p>
		</>
	);
}
