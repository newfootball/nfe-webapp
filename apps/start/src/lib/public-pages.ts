import { createServerFn } from "@tanstack/react-start";
import { publicPageContext } from "./public-pages.server";
export const getPublicPageContext = createServerFn({ method: "GET" }).handler(
	() => publicPageContext(),
);
