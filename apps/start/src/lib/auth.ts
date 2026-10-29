import { createServerFn } from "@tanstack/react-start";
import {
	authenticate,
	endSession,
	readAdmin,
	readPrivate,
	readSession,
	renameSelf,
} from "./auth.server";
import { validateLogin, validateName, validateSignup } from "./auth-input";

export const getSession = createServerFn({ method: "GET" }).handler(() =>
	readSession(),
);
export const signIn = createServerFn({ method: "POST" })
	.validator(validateLogin)
	.handler(({ data }) => authenticate(data, false));
export const signUp = createServerFn({ method: "POST" })
	.validator(validateSignup)
	.handler(({ data }) => authenticate(data, true));
export const signOut = createServerFn({ method: "POST" }).handler(() =>
	endSession(),
);
export const getPrivate = createServerFn({ method: "GET" }).handler(() =>
	readPrivate(),
);
export const getAdmin = createServerFn({ method: "GET" }).handler(() =>
	readAdmin(),
);
export const updateOwnName = createServerFn({ method: "POST" })
	.validator(validateName)
	.handler(({ data }) => renameSelf(data));
