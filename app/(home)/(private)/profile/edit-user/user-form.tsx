"use client";

import type { User } from "@prisma/client";
import { Loader2 } from "lucide-react";
import Link from "next/dist/client/link";
import { useTranslations } from "next-intl";
import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { InputLayout } from "@/components/layouts/input-layout";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getUser } from "@/src/query/user.query";
import { updateUser } from "./edit-user.action";
import { userSchema } from "./user.schema";

export const UserForm = ({ userId }: { userId: string }) => {
	const t = useTranslations("profile.edit-user");
	const [user, setUser] = useState<User | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);

	useEffect(() => {
		const fetchUser = async () => {
			const user = await getUser(userId);
			setUser(user);
		};
		fetchUser();
	}, [userId]);

	const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		setError(null);
		setIsLoading(true);

		const parsedData = userSchema.safeParse(user);

		if (!parsedData.success) {
			setError(parsedData.error.message);
			return;
		}

		updateUser(userId, parsedData.data)
			.then(() => {
				toast.success(t("user-updated-successfully"));
			})
			.finally(() => {
				setIsLoading(false);
			});
	};

	return (
		<form onSubmit={handleSubmit}>
			{error && (
				<Alert className="text-red-500 mb-4" variant="destructive">
					{error}
				</Alert>
			)}

			<InputLayout className="grid w-full max-w-sm items-center gap-1.5 mb-4">
				<Label htmlFor="email">{t("email")}</Label>
				<Input
					type="email"
					id="email"
					placeholder={t("email")}
					value={user?.email || ""}
					onChange={(e) => setUser({ ...user, email: e.target.value } as User)}
				/>
			</InputLayout>

			<InputLayout>
				<Label htmlFor="name">{t("full-name")}</Label>
				<Input
					type="text"
					id="name"
					placeholder={t("full-name")}
					value={user?.fullName || ""}
					onChange={(e) =>
						setUser({ ...user, fullName: e.target.value } as User)
					}
				/>
			</InputLayout>

			<InputLayout>
				<Label htmlFor="birthday">{t("birthday")}</Label>
				<Input
					type="date"
					id="birthday"
					value={
						user?.birthday
							? new Date(user.birthday).toISOString().split("T")[0]
							: ""
					}
					onChange={(e) =>
						setUser({
							...user,
							birthday: e.target.value ? new Date(e.target.value) : null,
						} as User)
					}
				/>
			</InputLayout>

			<InputLayout>
				<Label htmlFor="biography">{t("biography")}</Label>
				<Textarea
					id="biography"
					placeholder={t("biography")}
					value={user?.biography || ""}
					onChange={(e) =>
						setUser({ ...user, biography: e.target.value } as User)
					}
				/>
			</InputLayout>

			<Button className="w-full mt-2" type="submit" disabled={isLoading}>
				{isLoading ? <Loader2 className="animate-spin" /> : t("save")}
			</Button>

			<Link href="/profile">
				<Button className="w-full mt-2" type="button" variant="ghost">
					{t("back-to-profile")}
				</Button>
			</Link>
		</form>
	);
};
