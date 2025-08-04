"use client";

import { Button } from "@/components/ui/button";
import { signIn } from "@/src/lib/auth-client";
import { SiGoogle } from "@icons-pack/react-simple-icons";

export const GoogleButton = () => {
	const handleClick = async () => {
		await signIn.social({
			provider: "google",
			callbackURL: "/",
		});
	};

	return (
		<Button variant="outline" className="w-full" onClick={handleClick}>
			<SiGoogle />
			Google
		</Button>
	);
};
