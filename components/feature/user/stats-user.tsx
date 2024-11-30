"use client";

import { getCountFollowers, getCountFollowing } from "@/query/follow.query";
import { getCountPosts } from "@/query/post.query";
import { useEffect, useState } from "react";

interface StatsInterface {
	countPosts: number;
	countFollowers: number;
	countFollowing: number;
}

export const StatsUser = ({ userId }: { userId: string }) => {
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
				<div className="text-sm text-muted-foreground">posts</div>
			</div>
			<div>
				<div className="font-bold">{stats.countFollowers}</div>
				<div className="text-sm text-muted-foreground">followers</div>
			</div>
			<div>
				<div className="font-bold">{stats.countFollowing}</div>
				<div className="text-sm text-muted-foreground">following</div>
			</div>
		</div>
	);
};
