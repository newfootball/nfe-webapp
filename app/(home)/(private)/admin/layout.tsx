"use server";

import { getSession } from "@/src/lib/auth-server";
import { getUserRole } from "@/src/query/user.query";
import { redirect } from "next/navigation";

export default async function AdminLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const session = await getSession();
	
	if (!session?.user?.id) {
		redirect("/sign-in");
	}

	const userRole = await getUserRole(session.user.id);
	
	if (userRole !== "ADMIN") {
		redirect("/");
	}

	return <>{children}</>;
}
