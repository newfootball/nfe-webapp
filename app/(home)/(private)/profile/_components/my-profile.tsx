"use client";

import { useQuery } from "@tanstack/react-query";
import { UserProfile } from "@/components/feature/user/user-profile";
import { getUser } from "@/src/query/user.query";

export const MyProfile = ({ userIdSession }: { userIdSession: string }) => {
	const { data: user } = useQuery({
		queryKey: ["user", userIdSession],
		queryFn: () => getUser(userIdSession),
	});

	if (!user) return null;

	return <UserProfile user={user} userIdSession={userIdSession} />;
};
