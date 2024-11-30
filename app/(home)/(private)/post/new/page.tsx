import { PageHeader } from "@/components/feature/page-header";
import type React from "react";
import MakePostForm from "./make-post-form";

export default function page(): React.ReactElement {
	return (
		<div className="min-h-screen bg-background">
			<PageHeader title="Make a post" backLink="/" />
			<MakePostForm />
		</div>
	);
}
