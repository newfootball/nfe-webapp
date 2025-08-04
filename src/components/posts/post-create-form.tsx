"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { usePostsActions } from "@/src/store/posts.store";
import { PostWithUserAndMedias } from "@/src/types/post.types";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useState } from "react";

interface PostCreateFormProps {
  onSuccess?: () => void;
}

export const PostCreateForm = ({ onSuccess }: PostCreateFormProps) => {
  const { data: session } = useSession();
  const { addPost } = usePostsActions();
  const t = useTranslations("posts");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.user?.id || isSubmitting) return;

    setIsSubmitting(true);

    try {
      // Create mock post - in real app, this would call a server action
      const newPost: PostWithUserAndMedias = {
        id: `temp-${Date.now()}`,
        slug: `post-${Date.now()}`,
        userId: session.user.id,
        title: formData.title,
        description: formData.description,
        type: "video",
        status: "DRAFT",
        spamScore: "NONE",
        createdAt: new Date(),
        updatedAt: new Date(),
        expiresAt: null,
        validatedAt: null,
        publishedAt: null,
        user: {
          id: session.user.id,
          name: session.user.name || null,
          email: session.user.email || null,
          emailVerified: null,
          image: session.user.image || null,
          password: null,
          resetToken: null,
          resetTokenExpiry: null,
          birthday: null,
          fullName: null,
          biography: null,
          position: [],
          foot: [],
          license: null,
          contract: null,
          size: null,
          weight: null,
          localisation: null,
          gender: null,
          role: "USER" as const,
          userType: "USER" as const,
          isOnboarded: false,
          language: "en",
          createdAt: new Date(),
          updatedAt: null,
        },
        medias: [],
        _count: {
          comments: 0,
          likes: 0,
        },
      };

      // Add to store immediately for optimistic updates
      addPost(newPost);

      // Reset form
      setFormData({ title: "", description: "" });
      onSuccess?.();
    } catch (error) {
      console.error("Error creating post:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4 border rounded-lg">
      <h3 className="text-lg font-semibold">{t("create-post")}</h3>

      <Input
        placeholder={t("post-title")}
        value={formData.title}
        onChange={(e) =>
          setFormData((prev) => ({ ...prev, title: e.target.value }))
        }
        required
      />

      <Textarea
        placeholder={t("post-description")}
        value={formData.description}
        onChange={(e) =>
          setFormData((prev) => ({ ...prev, description: e.target.value }))
        }
        rows={3}
        required
      />

      <Button
        type="submit"
        disabled={
          isSubmitting || !formData.title.trim() || !formData.description.trim()
        }
        className="w-full"
      >
        {isSubmitting ? t("creating") : t("create-post")}
      </Button>
    </form>
  );
};
