import { Client, type Models, Query, TablesDB } from "node-appwrite";
import type { ProjectionRow } from "./projection";

export function targetBinding(
	endpoint: string,
	project: string,
	database: string,
) {
	const url = new URL(endpoint);
	if (
		url.protocol !== "http:" ||
		url.hostname !== "127.0.0.1" ||
		url.pathname !== "/v1" ||
		!url.port ||
		url.search ||
		url.hash ||
		url.username ||
		url.password ||
		!/^nfe-import-63-[a-z0-9-]+$/.test(project) ||
		!database
	)
		throw new Error("isolated_loopback_target_required");
	return JSON.stringify([url.href, project, database]);
}
export interface Target {
	get(table: string, id: string): Promise<ProjectionRow | null>;
	create(row: ProjectionRow): Promise<void>;
	delete(table: string, id: string): Promise<void>;
	list(table: string): Promise<ProjectionRow[]>;
}
export class AppwriteTarget implements Target {
	private db: TablesDB;
	constructor(
		endpoint: string,
		project: string,
		key: string,
		private database: string,
	) {
		targetBinding(endpoint, project, database);
		this.db = new TablesDB(
			new Client().setEndpoint(endpoint).setProject(project).setKey(key),
		);
	}
	private map(table: string, row: Models.DefaultRow): ProjectionRow {
		const data = Object.fromEntries(
			Object.entries(row).filter(([key]) => !key.startsWith("$")),
		);
		return { table, id: row.$id, data, permissions: row.$permissions };
	}
	async get(table: string, id: string) {
		try {
			return this.map(
				table,
				await this.db.getRow({
					databaseId: this.database,
					tableId: table,
					rowId: id,
				}),
			);
		} catch (error) {
			if ((error as { code?: number }).code === 404) return null;
			throw error;
		}
	}
	async create(row: ProjectionRow) {
		await this.db.createRow({
			databaseId: this.database,
			tableId: row.table,
			rowId: row.id,
			data: row.data,
			permissions: row.permissions,
		});
	}
	async delete(table: string, id: string) {
		await this.db.deleteRow({
			databaseId: this.database,
			tableId: table,
			rowId: id,
		});
	}
	async list(table: string) {
		const rows: ProjectionRow[] = [];
		let offset = 0;
		for (;;) {
			const page = await this.db.listRows({
				databaseId: this.database,
				tableId: table,
				queries: [Query.limit(100), Query.offset(offset)],
				ttl: 0,
			});
			rows.push(...page.rows.map((row) => this.map(table, row)));
			if (rows.length >= page.total || page.rows.length === 0) break;
			offset += page.rows.length;
		}
		return rows;
	}
}
