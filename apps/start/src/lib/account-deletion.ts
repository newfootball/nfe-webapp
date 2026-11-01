import { createServerFn } from "@tanstack/react-start";
import {
	resumeAccountDeletionAsAdmin,
	startOwnAccountDeletion,
} from "./account-deletion.server";
import {
	validateResumeAccountDeletion,
	validateStartAccountDeletion,
} from "./account-deletion-contract";

export const deleteOwnAccount = createServerFn({ method: "POST" })
	.validator(validateStartAccountDeletion)
	.handler(({ data }) => startOwnAccountDeletion(data));
export const recoverAccountDeletion = createServerFn({ method: "POST" })
	.validator(validateResumeAccountDeletion)
	.handler(({ data }) => resumeAccountDeletionAsAdmin(data));
