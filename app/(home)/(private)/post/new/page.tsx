"use client";

import { PageHeader } from "@/components/feature/page-header";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import type React from "react";
import MakePostForm from "./make-post-form";

export default function PostNewPage(): React.ReactElement {
	const session = useSession();

	if (session.status !== "authenticated") {
		redirect("/sign-in");
	}

	return (
		<div className="min-h-screen bg-background">
			<PageHeader title="Make a post" backLink="/" />
			<MakePostForm />
		</div>
	);
}
