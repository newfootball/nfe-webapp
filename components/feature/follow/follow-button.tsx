"use client";

import { UserCheck, UserRoundPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { checkIsFollowing } from "@/src/query/follow.query";
import { addFollow, removeFollow } from "./follow.action";

export const FollowButton = ({
	userId,
	showText = false,
}: {
	userId: string;
	showText?: boolean;
}) => {
	const t = useTranslations("follow-button");
	const [isFollowing, setIsFollowing] = useState(false);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		const fetchFollowStatus = async () => {
			try {
				const isUserFollowing = await checkIsFollowing(userId);
				setIsFollowing(isUserFollowing);
			} catch (error) {
				console.error(t("error-checking-follow-status"), error);
			} finally {
				setIsLoading(false);
			}
		};

		fetchFollowStatus();
	}, [userId, t]);

	const handleToggleFollow = async () => {
		setIsLoading(true);
		try {
			if (isFollowing) {
				await removeFollow({ userToUnfollowId: userId });
				setIsFollowing(false);
				toast.success(t("you-are-now-unfollowing-this-user"));
			} else {
				await addFollow({ userToFollowId: userId });
				setIsFollowing(true);
				toast.success(t("you-are-now-following-this-user"));
			}
		} catch (error) {
			console.error(error);
			toast.error(t("an-error-occurred"));
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<Button
			variant={isFollowing ? "secondary" : "outline"}
			size={showText ? "sm" : "icon"}
			onClick={handleToggleFollow}
			disabled={isLoading}
		>
			{isFollowing ? (
				<UserCheck className="h-4 w-4" />
			) : (
				<UserRoundPlus className="h-4 w-4" />
			)}
			{showText && (isFollowing ? t("following") : t("follow"))}
		</Button>
	);
};
