"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { getCountFollowers, getCountFollowing } from "@/src/query/follow.query";
import { getCountPosts } from "@/src/query/post.query";

interface StatsInterface {
	countPosts: number;
	countFollowers: number;
	countFollowing: number;
}

export const StatsUser = ({ userId }: { userId: string }) => {
	const t = useTranslations("feature.user.stats");
	const [stats, setStats] = useState<StatsInterface>({
		countPosts: 0,
		countFollowers: 0,
		countFollowing: 0,
	});

	useEffect(() => {
		const fetchStats = async () => {
			const [countPosts, countFollowers, countFollowing] = await Promise.all([
				getCountPosts(userId),
				getCountFollowers(userId),
				getCountFollowing(userId),
			]);

			setStats({ countPosts, countFollowers, countFollowing });
		};

		fetchStats();
	}, [userId]);

	return (
		<div className="flex justify-around my-8 text-center">
			<div>
				<div className="font-bold">{stats.countPosts}</div>
				<div className="text-sm text-muted-foreground">{t("posts")}</div>
			</div>
			<div>
				<div className="font-bold">{stats.countFollowers}</div>
				<div className="text-sm text-muted-foreground">{t("followers")}</div>
			</div>
			<div>
				<div className="font-bold">{stats.countFollowing}</div>
				<div className="text-sm text-muted-foreground">{t("following")}</div>
			</div>
		</div>
	);
};
