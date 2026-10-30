import { createServerFn } from "@tanstack/react-start";
import { editPostText, readOwnPost, readOwnPosts } from "./post-text.server";
import {
	validateOwnPost,
	validateOwnPosts,
	validatePostText,
} from "./post-text-input";
export const getOwnPosts = createServerFn({ method: "GET" })
	.validator(validateOwnPosts)
	.handler(({ data }) => readOwnPosts(data));
export const getOwnPost = createServerFn({ method: "GET" })
	.validator(validateOwnPost)
	.handler(({ data }) => readOwnPost(data));
export const savePostText = createServerFn({ method: "POST" })
	.validator(validatePostText)
	.handler(({ data }) => editPostText(data));
