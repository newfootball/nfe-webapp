import assert from "node:assert/strict";
import { cp, lstat, mkdir, readdir, realpath } from "node:fs/promises";
import { builtinModules } from "node:module";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { appRoot } from "./local-runtime-state";

async function safeDependencyTree(root: string, path = root) {
	for (const name of await readdir(path)) {
		const entry = resolve(path, name),
			info = await lstat(entry);
		if (info.isSymbolicLink()) {
			const target = await realpath(entry);
			assert.ok(
				target.startsWith(`${root}${sep}`),
				"Installed dependency link escapes its frozen tree",
			);
		} else if (info.isDirectory()) await safeDependencyTree(root, entry);
	}
}
function packageImport(path: string) {
	return (
		!path.startsWith(".") &&
		!path.startsWith("/") &&
		!path.startsWith("node:") &&
		path !== "bun" &&
		!builtinModules.includes(path)
	);
}
async function moduleFile(path: string) {
	for (const candidate of [
		path,
		`${path}.ts`,
		`${path}.tsx`,
		`${path}.js`,
		`${path}.json`,
		`${path}/index.ts`,
		`${path}/index.js`,
	])
		if (await Bun.file(candidate).exists()) return candidate;
	throw new Error("Runtime source dependency missing");
}
export async function copyRuntimePayload(directory: string) {
	const dependencies = resolve(appRoot, "node_modules");
	await safeDependencyTree(dependencies);
	// Preserve exact installed package bytes. Internal links become regular files;
	// no runtime payload symlink or install/network dependency remains.
	await cp(dependencies, `${directory}/node_modules`, {
		recursive: true,
		dereference: true,
		errorOnExist: true,
	});
	await cp(`${appRoot}/dist`, `${directory}/dist`, {
		recursive: true,
		errorOnExist: true,
	});
	const pending = [
		`${appRoot}/server.ts`,
		`${appRoot}/scripts/local-runtime-consumer.ts`,
	];
	const visited = new Set<string>();
	while (pending.length) {
		const path = pending.pop() as string;
		if (visited.has(path)) continue;
		visited.add(path);
		assert.ok(
			path.startsWith(`${appRoot}${sep}`),
			"Runtime source escapes Start boundary",
		);
		const destination = resolve(directory, relative(appRoot, path));
		await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
		await cp(path, destination);
		if (![".ts", ".tsx", ".js", ".jsx", ".mjs"].includes(extname(path)))
			continue;
		const loader = [".tsx", ".jsx"].includes(extname(path))
			? "tsx"
			: extname(path) === ".ts"
				? "ts"
				: "js";
		for (const item of new Bun.Transpiler({ loader }).scanImports(
			await Bun.file(path).text(),
		)) {
			if (packageImport(item.path)) {
				const resolved = Bun.resolveSync(item.path, dirname(destination));
				assert.ok(
					resolved.startsWith(`${directory}/node_modules/`),
					"Runtime package escaped immutable artifact",
				);
			} else if (item.path.startsWith("."))
				pending.push(await moduleFile(resolve(dirname(path), item.path)));
		}
	}
}
