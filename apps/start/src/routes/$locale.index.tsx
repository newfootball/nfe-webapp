import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { messages } from "../lib/messages";
import { readerOptions } from "../lib/reader";
export const Route = createFileRoute("/$locale/")({
	loader: ({ context }) => context.queryClient.ensureQueryData(readerOptions),
	headers: () => ({ "Cache-Control": "private, no-store" }),
	component: Home,
});
function Home() {
	const { locale } = Route.useRouteContext();
	const t = messages[locale];
	const { data } = useSuspenseQuery(readerOptions);
	return (
		<>
			<h1 className="mb-6 text-5xl font-bold">{t.title}</h1>
			<p className="text-lg text-muted-foreground">{t.intro}</p>
			<p data-testid="reader" className="mt-6 text-sm">
				{data}
			</p>
		</>
	);
}
