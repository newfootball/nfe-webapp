"use client";

import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function Home() {
	return (
		<Layout>
			<Button onClick={() => toast.success("Hello, world!")}>Click</Button>
		</Layout>
	);
}
