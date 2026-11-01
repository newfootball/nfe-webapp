import { createServerFn } from "@tanstack/react-start";
import {
	deletePost,
	readPostLifecycle,
	replacePostMedia,
	resumePostLifecycle,
	transitionPost,
} from "./post-lifecycle.server";
import {
	validateDeletion,
	validateLifecycleResume,
	validateReplacement,
	validateTransition,
} from "./post-lifecycle-contract";
import { validateOwnPost } from "./post-text-input";
export const changePostStatus = createServerFn({ method: "POST" })
	.validator(validateTransition)
	.handler(({ data }) => transitionPost(data));
export const changePostMedia = createServerFn({ method: "POST" })
	.validator(validateReplacement)
	.handler(({ data }) => replacePostMedia(data));
export const removePost = createServerFn({ method: "POST" })
	.validator(validateDeletion)
	.handler(({ data }) => deletePost(data));
export const continuePostLifecycle = createServerFn({ method: "POST" })
	.validator(validateLifecycleResume)
	.handler(({ data }) => resumePostLifecycle(data));
export const getPostLifecycle = createServerFn({ method: "GET" })
	.validator(validateOwnPost)
	.handler(({ data }) => readPostLifecycle(data));
