"use client";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getUser } from "@/query/user.query";
import type { User } from "@prisma/client";
import { type FormEvent, useEffect, useState } from "react";
import { z } from "zod";

const userSchema = z.object({
	email: z.string().email(),
	fullName: z.string(),
});

export const UserForm = ({ userId }: { userId: string }) => {
	const [user, setUser] = useState<User | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const fetchUser = async () => {
			const user = await getUser(userId);
			setUser(user);
		};
		fetchUser();
	}, [userId]);

	const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();

		const formData = new FormData(e.currentTarget);
		const data = Object.fromEntries(formData.entries());

		const parsedData = userSchema.safeParse(data);

		if (!parsedData.success) {
			setError("Invalid data");
			return;
		}

		console.log(parsedData.data);
	};

	return (
		<form onSubmit={handleSubmit}>
			{error && <Alert className="text-red-500">{error}</Alert>}

			<div className="grid w-full max-w-sm items-center gap-1.5 mb-4">
				<Label htmlFor="email">Email</Label>
				<Input
					type="email"
					id="email"
					placeholder="Email"
					value={user?.email || ""}
				/>
			</div>
			<div className="grid w-full max-w-sm items-center gap-1.5 mb-4">
				<Label htmlFor="name">Full name</Label>
				<Input
					type="text"
					id="name"
					placeholder="Full name"
					value={user?.fullName || ""}
				/>
			</div>
			<Button className="w-full mt-2" type="submit">
				Save
			</Button>
		</form>
	);
};
