// The route supplies the request-context origin guard and server-only broker.
export async function googleStartResponse(
	request: Request,
	authorize: () => unknown,
	begin: (locale: "fr" | "en") => Promise<string>,
) {
	let locale: "fr" | "en" = "fr";
	try {
		authorize();
		const form = await request.formData();
		if (
			[...form.keys()].some((key) => key !== "locale") ||
			form.getAll("locale").length !== 1
		)
			throw new Error("Invalid input");
		const candidate = form.get("locale");
		if (candidate !== "fr" && candidate !== "en")
			throw new Error("Invalid locale");
		locale = candidate;
		return redirect(await begin(locale));
	} catch {
		return redirect(`/${locale}/sign-in?oauth=failed`);
	}
}
function redirect(location: string) {
	return new Response(null, {
		status: 303,
		headers: {
			Location: location,
			"Cache-Control": "private, no-store",
			"Referrer-Policy": "no-referrer",
		},
	});
}
