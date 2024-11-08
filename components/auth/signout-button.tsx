import { Button } from "@/components/ui/button";
import { signOut } from "next-auth/react";
import React from "react";

export const SignoutButton = () => {
	return (
		<Button variant="link" onClick={() => signOut({ redirectTo: "/" })}>
			Sign Out
		</Button>
	);
};
