const forbidden =
	/START_APPWRITE_MESSAGING_WRITER_KEY|message_limits|createTransaction|messaging\.server|node-appwrite/;
let files = 0;
for await (const path of new Bun.Glob("**/*.js").scan(
	`${import.meta.dir}/../dist/client`,
)) {
	if (
		forbidden.test(
			await Bun.file(`${import.meta.dir}/../dist/client/${path}`).text(),
		)
	)
		throw new Error(`Messaging server boundary leaked: ${path}`);
	files++;
}
if (!files) throw new Error("Build first");
process.stdout.write(`Messaging client boundary: ${files} artifacts clean\n`);
