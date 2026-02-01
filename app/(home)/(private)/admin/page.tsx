import { UsersIcon } from "lucide-react";
import Link from "next/link";
import { Layout } from "@/components/layouts/layout";
import { Button } from "@/components/ui/button";

export default function AdminPage() {
	return (
		<Layout>
			<div className="flex flex-col gap-4">
				<h1 className="text-2xl font-bold">Admin</h1>
				<p className="text-sm text-muted-foreground">
					Welcome to the admin dashboard
				</p>
				<Link href="/admin/users" className="text-sm text-muted-foreground">
					<Button variant="outline" className="w-fit">
						<UsersIcon className="w-4 h-4" />
						Users
					</Button>
				</Link>
			</div>
		</Layout>
	);
}
