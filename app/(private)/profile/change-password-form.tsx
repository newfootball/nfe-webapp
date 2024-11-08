"use client";

import { Button } from "@/components/ui/button";
import { Password } from "@/components/ui/password";
import type { User } from "@prisma/client";
import { useState } from "react";
import { z } from "zod";

const changePasswordSchema = z.object({
	currentPassword: z.string(),
	password: z.string(),
	confirmPassword: z.string(),
});

export const ChangePasswordForm = ({ user }: { user: User }) => {
	const [currentPassword, setCurrentPassword] = useState<string>("");
	const [password, setPassword] = useState<string>("");
	const [confirmPassword, setConfirmPassword] = useState<string>("");

	const result = changePasswordSchema.safeParse({
		currentPassword,
		password,
		confirmPassword,
	});

	if (!result.success) {
		console.log(result.error.errors);
	}

	return (
		<form action="">
			<div className="grid w-full max-w-sm items-center">
				<Password
					label="Current password"
					id="password"
					name="currentPassword"
					value={currentPassword}
					onChange={(e) => setCurrentPassword(e.target.value)}
				/>

				<Password
					label="New password"
					id="password"
					name="password"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
				/>

				<Password
					label="Confirm new password"
					id="confirmPassword"
					name="confirmPassword"
					value={confirmPassword}
					onChange={(e) => setConfirmPassword(e.target.value)}
				/>
			</div>
			<Button className="w-full mt-2" type="submit">
				Change password
			</Button>
		</form>
	);
};
