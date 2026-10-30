import { createServerFn } from "@tanstack/react-start";
import { readDirectory } from "./directory.server";
import { DirectorySchema } from "./directory-input";
import { publicPageContext } from "./public-pages.server";
export const getDirectory = createServerFn({ method: "GET" })
	.validator((v: unknown) => DirectorySchema.parse(v))
	.handler(async ({ data }) => ({
		...(await publicPageContext()),
		...(await readDirectory(data)),
	}));
