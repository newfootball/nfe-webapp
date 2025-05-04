import { Layout } from "@/components/layouts/layout";
import UsersList from "./_components/users-list";

export default function UsersAdminPage() {
	return (
		<Layout>
			<div className="flex flex-col gap-4">
				<h1 className="text-2xl font-bold">Users</h1>
				<p className="text-sm text-muted-foreground">
					Welcome to the users admin dashboard
				</p>
			</div>
			<UsersList />
		</Layout>
	);
}
