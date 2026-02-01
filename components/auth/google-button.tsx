"use client";

import { SiGoogle } from "@icons-pack/react-simple-icons";
import { Button } from "@/components/ui/button";
import { signIn } from "@/src/lib/auth-client";

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
