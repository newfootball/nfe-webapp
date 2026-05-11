"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { InputLayout } from "@/components/layouts/input-layout";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { User } from "@/src/generated/prisma/client";
import {
	Foot,
	type Foot as FootValue,
	Position,
} from "@/src/generated/prisma/enums";
import { getUser } from "@/src/query/user.query";
import { updateUser } from "./edit-user.action";
import { userSchema } from "./user.schema";

const ALL_POSITIONS = Object.values(Position);

const getFootValue = (foot: FootValue[]): string => {
	if (foot.includes(Foot.LEFT) && foot.includes(Foot.RIGHT)) return "BOTH";
	if (foot.includes(Foot.LEFT)) return "LEFT";
	if (foot.includes(Foot.RIGHT)) return "RIGHT";
	return "";
};

const footValueToArray = (value: string): Foot[] => {
	if (value === "BOTH") return [Foot.LEFT, Foot.RIGHT];
	if (value === "LEFT") return [Foot.LEFT];
	if (value === "RIGHT") return [Foot.RIGHT];
	return [];
};

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
			setIsLoading(false);
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

	const togglePosition = (pos: Position) => {
		if (!user) return;
		const current = user.position ?? [];
		const updated = current.includes(pos)
			? current.filter((p) => p !== pos)
			: [...current, pos];
		setUser({ ...user, position: updated } as User);
	};

	return (
		<form onSubmit={handleSubmit}>
			{error && (
				<Alert className="text-red-500 mb-4" variant="destructive">
					{error}
				</Alert>
			)}

			<InputLayout>
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

			<InputLayout>
				<Label htmlFor="localisation">{t("localisation")}</Label>
				<Input
					type="text"
					id="localisation"
					placeholder={t("localisation-placeholder")}
					value={user?.localisation || ""}
					onChange={(e) =>
						setUser({ ...user, localisation: e.target.value } as User)
					}
				/>
			</InputLayout>

			<InputLayout>
				<Label>{t("position")}</Label>
				<div className="grid grid-cols-2 gap-2 mt-1">
					{ALL_POSITIONS.map((pos) => (
						<div key={pos} className="flex items-center gap-2">
							<Checkbox
								id={`pos-${pos}`}
								checked={(user?.position ?? []).includes(pos)}
								onCheckedChange={() => togglePosition(pos)}
							/>
							<Label
								htmlFor={`pos-${pos}`}
								className="font-normal cursor-pointer"
							>
								{t(pos)}
							</Label>
						</div>
					))}
				</div>
			</InputLayout>

			<InputLayout>
				<Label htmlFor="foot">{t("foot")}</Label>
				<Select
					value={getFootValue(user?.foot ?? [])}
					onValueChange={(value) =>
						setUser({ ...user, foot: footValueToArray(value) } as User)
					}
				>
					<SelectTrigger id="foot">
						<SelectValue placeholder={t("foot-placeholder")} />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="LEFT">{t("foot-left")}</SelectItem>
						<SelectItem value="RIGHT">{t("foot-right")}</SelectItem>
						<SelectItem value="BOTH">{t("foot-both")}</SelectItem>
					</SelectContent>
				</Select>
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
