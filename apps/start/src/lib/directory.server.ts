import "@tanstack/react-start/server-only";
import { Query } from "node-appwrite";
import type { DirectoryInput } from "./directory-input";
import { publicReadConnection } from "./feed.server";
import { authorDTO } from "./feed-contract";
export async function readDirectory(input: DirectoryInput) {
	const c = publicReadConnection();
	const types = {
		players: "PLAYER",
		coaches: "COACH",
		recruiters: "RECRUITER",
		clubs: "CLUB",
	};
	const queries = [
		Query.equal("isOnboarded", true),
		Query.equal("userType", types[input.type]),
		Query.orderDesc("createdAt"),
		Query.orderDesc("$id"),
		Query.limit(21),
		Query.offset((input.page - 1) * 20),
		Query.select([
			"$id",
			"name",
			"image",
			"localisation",
			"userType",
			"position",
			"isOnboarded",
			"createdAt",
		]),
	];
	if (input.position)
		queries.push(
			Query.contains("position", [
				input.position.replaceAll("-", "_").toUpperCase(),
			]),
		);
	if (input.city) queries.push(Query.contains("localisation", [input.city]));
	const result = await c.publicDB.listRows({
		databaseId: c.databaseId,
		tableId: "profiles",
		queries,
		total: false,
	});
	return {
		users: result.rows.slice(0, 20).map(authorDTO),
		hasNext: result.rows.length > 20,
	};
}
