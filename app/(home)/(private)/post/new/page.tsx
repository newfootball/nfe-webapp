"use client";

import { redirect } from "next/navigation";
import type React from "react";
import { PageHeader } from "@/components/feature/page-header";
import { useSession } from "@/src/lib/auth-client";
import MakePostForm from "./make-post-form";

export default function PostNewPage(): React.ReactElement {
	const { data: session } = useSession();

	if (!session) {
		redirect("/sign-in");
	}

	return (
		<div className="bg-background">
			<PageHeader title="Make a post" backLink="/" />
			<MakePostForm />
		</div>
	);
}
