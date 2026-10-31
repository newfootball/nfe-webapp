import { createServerFn } from "@tanstack/react-start";
import {
	createReport,
	dashboard,
	decideReport,
	listAdmin,
} from "./moderation.server";
import {
	validateAdminPage,
	validateDecision,
	validateReport,
} from "./moderation-input";
export const getModerationDashboard = createServerFn({ method: "GET" }).handler(
	() => dashboard(),
);
export const getAdminPage = createServerFn({ method: "GET" })
	.validator(validateAdminPage)
	.handler(({ data }) => listAdmin(data));
export const reportPost = createServerFn({ method: "POST" })
	.validator(validateReport)
	.handler(({ data }) => createReport(data));
export const moderateReport = createServerFn({ method: "POST" })
	.validator(validateDecision)
	.handler(({ data }) => decideReport(data));
