"use client";

import { Button } from "@/components/ui/button";
import { SiGoogle } from "@icons-pack/react-simple-icons";

export const GoogleButton = () => {
	const handleClick = () => {
		console.log("Google button clicked");
	};

	return (
		<Button variant="outline" className="w-full" onClick={handleClick}>
			<SiGoogle />
			Google
		</Button>
	);
};
