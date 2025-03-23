"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Post } from "@prisma/client";
import { Ellipsis } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import type { PostData } from "./post.schema";
import { savePost } from "./save-post.action";

export default function MakePostForm() {
	const router = useRouter();
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [selectedImage, setSelectedImage] = useState<File | null>(null);
	const [selectedVideo, setSelectedVideo] = useState<File | null>(null);
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");

	const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (file) {
			const reader = new FileReader();
			reader.onloadend = () => {
				setSelectedImage(file);
			};
			reader.readAsDataURL(file);
		}
	};

	const handleVideoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (file) {
			setSelectedVideo(file);
		}
	};

	const handleSavePost = async (event: React.FormEvent<HTMLFormElement>) => {
		setIsLoading(true);
		setError(null);
		event.preventDefault();

		const data = {
			title,
			description,
			image: selectedImage,
			video: selectedVideo,
		} as PostData;

		savePost(data)
			.then((post: Post) => {
				toast.success("Post created successfully");
				router.push(`/post/${post.id}`);
			})
			.catch((error) => {
				setError(error.message);
				toast.error(error.message);
			})
			.finally(() => {
				setIsLoading(false);
			});
	};

	return (
		<main className="container max-w-md mx-auto p-4 space-y-4 mt-20 md:mt-4">
			<form onSubmit={handleSavePost}>
				{error && (
					<Alert variant="destructive" className="mb-4">
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}
				<div className="mb-4">
					<Input
						type="text"
						placeholder="Add a title"
						className="text-lg font-semibold bg-transparent px-0 placeholder:text-muted-foreground mb-4 p-2"
						value={title}
						onChange={(e) => setTitle(e.target.value)}
					/>

					<Textarea
						placeholder="Write a description..."
						className="min-h-[100px] bg-transparent resize-none px-0 placeholder:text-muted-foreground mb-4 p-2"
						value={description}
						onChange={(e) => setDescription(e.target.value)}
					/>

					{selectedImage ? (
						<div className="aspect-square relative rounded-2xl h-48 w-full overflow-hidden bg-muted">
							<Image
								src={URL.createObjectURL(selectedImage)}
								alt="Selected image"
								fill
								className="object-cover"
							/>
						</div>
					) : (
						<Label
							className="block aspect-square rounded-2xl border-2 border-dashed h-24 mb-4 w-full border-muted-foreground/25 hover:border-muted-foreground/50 transition-colors cursor-pointer"
							htmlFor="image"
						>
							<Input
								id="image"
								type="file"
								accept="image/*"
								className="hidden"
								onChange={handleImageUpload}
							/>
							<div className="flex items-center justify-center h-full">
								<span className="text-muted-foreground text-center">
									Click to upload image
								</span>
							</div>
						</Label>
					)}
				</div>

				<div className="mb-4">
					{selectedVideo ? (
						<div className="aspect-square relative rounded-2xl overflow-hidden bg-muted h-48 w-full">
							<video
								src={URL.createObjectURL(selectedVideo)}
								className="object-cover"
								muted
							/>
						</div>
					) : (
						<Label
							className="block h-48 w-full aspect-square rounded-2xl border-2 border-dashed border-muted-foreground/25 hover:border-muted-foreground/50 transition-colors cursor-pointer"
							htmlFor="video"
						>
							<Input
								id="video"
								type="file"
								accept="video/*"
								className="hidden"
								onChange={handleVideoUpload}
							/>
							<div className="flex items-center justify-center h-full">
								<span className="text-muted-foreground text-center">
									Click to upload video
								</span>
							</div>
						</Label>
					)}
				</div>

				{isLoading && (
					<div className="flex items-center justify-center">
						<Ellipsis className="w-4 h-4 animate-spin" />
					</div>
				)}

				<Button
					className="w-full bg-primary hover:bg-primary/80 text-dark mt-2"
					size="lg"
					disabled={isLoading}
				>
					Submit
				</Button>
			</form>
		</main>
	);
}
