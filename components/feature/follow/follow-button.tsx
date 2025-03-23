"use client";

import { Button } from "@/components/ui/button";
import { checkIsFollowing } from "@/src/query/follow.query";
import type { Follow } from "@prisma/client";
import { UserCheck, UserRoundPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { addFollow } from "./follow.action";

export const FollowButton = ({
  userId,
  showText = false,
}: {
  userId: string;
  showText?: boolean;
}) => {
  const [isFollowing, setIsFollowing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchFollowStatus = async () => {
      try {
        const isUserFollowing = await checkIsFollowing(userId);
        setIsFollowing(isUserFollowing);
      } catch (error) {
        console.error("Error checking follow status:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchFollowStatus();
  }, [userId]);

  const handleFollow = async () => {
    if (isFollowing) return;

    setIsLoading(true);
    addFollow({ userToFollowId: userId })
      .then((follow: Follow) => {
        toast.success("You are now following this user");
        setIsFollowing(true);
        setIsLoading(false);
      })
      .catch((error) => {
        console.error(error);
        toast.error("An error occurred");
        setIsLoading(false);
      });
  };

  return (
    <Button
      variant={isFollowing ? "secondary" : "outline"}
      color="primary"
      size={showText ? "sm" : "icon"}
      onClick={handleFollow}
      disabled={isLoading || isFollowing}
    >
      {isFollowing ? (
        <UserCheck className="h-4 w-4" />
      ) : (
        <UserRoundPlus className="h-4 w-4" />
      )}
      {showText && (isFollowing ? "Following" : "Follow")}
    </Button>
  );
};
