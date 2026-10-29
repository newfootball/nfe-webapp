import { createServerFn } from "@tanstack/react-start";
import {
	changePassword,
	finishChallenge,
	requestRecovery,
	requestVerification,
	verificationStatus,
} from "./recovery.server";
import {
	changeSchema,
	localeSchema,
	recoveryInput,
	requestSchema,
	resetSchema,
} from "./recovery-input";
export const forgotPassword = createServerFn({ method: "POST" })
	.validator((value: unknown) => recoveryInput(requestSchema, value))
	.handler(({ data }) => requestRecovery(data));
export const resetPassword = createServerFn({ method: "POST" })
	.validator((value: unknown) => recoveryInput(resetSchema, value))
	.handler(({ data }) => finishChallenge(data, "reset"));
export const updatePassword = createServerFn({ method: "POST" })
	.validator((value: unknown) => recoveryInput(changeSchema, value))
	.handler(({ data }) => changePassword(data));
export const sendVerification = createServerFn({ method: "POST" })
	.validator((value: unknown) => recoveryInput(localeSchema, value))
	.handler(({ data }) => requestVerification(data));
export const verifyEmail = createServerFn({ method: "POST" })
	.validator((value: unknown) => recoveryInput(localeSchema, value))
	.handler(({ data }) => finishChallenge(data, "verify"));
export const getVerification = createServerFn({ method: "GET" }).handler(() =>
	verificationStatus(),
);
