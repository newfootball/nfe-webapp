import { resolve, sep } from "node:path";

// Vite emits content-hashed files under /assets; everything else may change between releases.
export function staticCacheControl(pathname: string) {
	return pathname.startsWith("/assets/")
		? "public, max-age=31536000, immutable"
		: "public, max-age=3600, must-revalidate";
}

// Only regular files inside the client root; dotfiles and traversal never resolve.
export function staticFilePath(clientRoot: string, pathname: string) {
	if (pathname.split("/").some((segment) => segment.startsWith(".")))
		return undefined;
	const path = resolve(clientRoot, `.${pathname}`);
	return path.startsWith(`${clientRoot}${sep}`) ? path : undefined;
}

export async function serveStatic(
	clientRoot: string,
	request: Request,
	pathname: string,
): Promise<Response | undefined> {
	if (request.method !== "GET" && request.method !== "HEAD") return;
	const path = staticFilePath(clientRoot, pathname);
	if (!path) return;
	const file = Bun.file(path);
	if (!(await file.exists())) return;
	const headers = {
		"Cache-Control": staticCacheControl(pathname),
		"Content-Type": file.type,
		"Content-Length": String(file.size),
		"X-Content-Type-Options": "nosniff",
	};
	return new Response(request.method === "HEAD" ? null : file, { headers });
}
