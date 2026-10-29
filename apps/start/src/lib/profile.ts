import { createServerFn } from "@tanstack/react-start";
import {
	completeOnboarding,
	editProfile,
	initializeProfile,
	readOwnProfile,
	readPublicProfile,
} from "./profile.server";
import {
	validateEdit,
	validateEmpty,
	validateOnboarding,
	validateProfileId,
} from "./profile-input";
export const getOwnProfile = createServerFn({ method: "GET" }).handler(() =>
	readOwnProfile(),
);
export const initProfile = createServerFn({ method: "POST" })
	.validator(validateEmpty)
	.handler(({ data }) => initializeProfile(data));
export const saveOnboarding = createServerFn({ method: "POST" })
	.validator(validateOnboarding)
	.handler(({ data }) => completeOnboarding(data));
export const saveProfile = createServerFn({ method: "POST" })
	.validator(validateEdit)
	.handler(({ data }) => editProfile(data));
export const getPublicProfile = createServerFn({ method: "GET" })
	.validator(validateProfileId)
	.handler(({ data }) => readPublicProfile(data));
