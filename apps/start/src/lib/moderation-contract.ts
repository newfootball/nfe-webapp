import type { SIGNAL_REASONS, SIGNAL_STATUSES } from "./moderation-input";
export type ReportDTO = {
	id: string;
	postId: string;
	userId: string;
	reason: (typeof SIGNAL_REASONS)[number];
	details: string | null;
	status: (typeof SIGNAL_STATUSES)[number];
	createdAt: string;
	version: string;
	post: { title: string; status: string | null; version: string } | null;
};
export type AdminUserDTO = {
	id: string;
	name: string | null;
	userType: string;
	isOnboarded: boolean;
	createdAt: string;
};
export type AdminPage = {
	viewerId: string;
	reports: ReportDTO[];
	users: AdminUserDTO[];
	nextCursor: string | null;
};
export type AdminDashboard = {
	viewerId: string;
	users: number;
	posts: number;
	pending: number;
};
export const spamScore = (count: number) =>
	count >= 10 ? "SPAM" : count >= 5 ? "SUSPECT" : "NONE";
