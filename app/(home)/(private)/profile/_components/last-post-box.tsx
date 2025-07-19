"use client";
import { Layout } from "@/components/layouts/layout";
import { Button } from "@/components/ui/button";
import { cn } from "@/src/lib/utils";
import { PostWithMedias } from "@/src/types/post.types";
import { MediaType } from "@prisma/client";
import { ChevronRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

const MAX_POSTS = 3;

export const LastPostBox = ({
  posts,
  count,
  title,
  isLoading,
}: {
  posts?: PostWithMedias[];
  count?: number;
  title: string;
  isLoading?: boolean;
}) => {
  return (
    <Layout>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <Button variant="ghost" size="sm" className="text-muted-foreground">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-1">
        {isLoading ? (
          <PostCardSkeleton text="..." />
        ) : (
          posts?.map((post) => <PostCard key={post.id} post={post} />)
        )}
        {count && count > MAX_POSTS && (
          <PostCardSkeleton text={count.toString()} />
        )}
      </div>
    </Layout>
  );
};

const PostCardSkeleton = ({ text }: { text: string }) => {
  return (
    <div className="aspect-square relative rounded-lg overflow-hidden bg-muted flex items-center justify-center">
      <span className="text-lg font-medium">{text}</span>
    </div>
  );
};

const PostCard = ({ post }: { post: PostWithMedias }) => {
  const image = post.medias.find(
    (media) => media.type === MediaType.landingImage,
  );
  return (
    <div
      key={post.id}
      className="aspect-square relative rounded-lg overflow-hidden"
    >
      <Link href={`/post/${post.id}`}>
        <Image
          src={
            image?.url ??
            "https://images.unsplash.com/photo-1526494661200-9d7cfd4b2404?q=80&w=200&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
          }
          alt={post.title ?? ""}
          className={cn("object-cover", {
            "opacity-50": post.medias.length === 0,
          })}
          fill
        />
      </Link>
    </div>
  );
};
