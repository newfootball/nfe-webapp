"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { User } from "@prisma/client";
import { useState } from "react";

export const UserForm = ({ user }: { user: User }) => {
	const [email, setEmail] = useState<string>(user.email || "");

	return (
		<form action="">
			<div className="grid w-full max-w-sm items-center gap-1.5">
				<Label htmlFor="email">Email</Label>
				<Input
					type="email"
					id="email"
					placeholder="Email"
					value={email}
					onChange={(e) => setEmail(e.target.value)}
				/>
			</div>
			<Button className="w-full mt-2" type="submit">
				Save
			</Button>
		</form>
	);
};
