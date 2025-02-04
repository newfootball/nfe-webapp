"use client";

import { Button } from "@/components/ui/button";
import { Follow } from "@prisma/client";
import { UserRoundPlus } from "lucide-react";
import { toast } from "sonner";
import { addFollow } from "./follow.action";

export const FollowButton = ({
  userId,
  showText = false,
}: {
  userId: string;
  showText?: boolean;
}) => {
  const handleFollow = async () => {
    addFollow({ userToFollowId: userId }).then((follow: Follow) => {
      toast.success("You are now following this user");
    });
  };

  return (
    <Button
      variant="outline"
      color="primary"
      size={showText ? "sm" : "icon"}
      onClick={handleFollow}
    >
      <UserRoundPlus className="h-4 w-4" />
      {showText && "Follow"}
    </Button>
  );
};
