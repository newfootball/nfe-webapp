"use client";

import { Button } from "@/components/ui/button";
import { SiGoogle } from "@icons-pack/react-simple-icons";
import { signIn } from "next-auth/react";

export const GoogleButton = () => {
	const handleClick = () => {
		signIn("google", { callbackUrl: "/" });
	};

	return (
		<Button variant="outline" className="w-full" onClick={handleClick}>
			<SiGoogle />
			Google
		</Button>
	);
};
