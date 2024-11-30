"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Ellipsis } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { toast } from "sonner";
import type { PostData } from "./post.schema";
import { savePost } from "./save-post.action";

export default function MakePostForm() {
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [selectedImage, setSelectedImage] = useState<string | null>(null);
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");

	const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (file) {
			const reader = new FileReader();
			reader.onloadend = () => {
				setSelectedImage(reader.result as string);
			};
			reader.readAsDataURL(file);
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
		} as PostData;

		console.log(data);

		await savePost(data)
			.catch((error) => {
				setError(error.message);
				toast.error(error.message);
			})
			.finally(() => {
				setIsLoading(false);
			});
	};

	return (
		<main className="container max-w-md mx-auto p-4 space-y-4">
			<form onSubmit={handleSavePost}>
				{error && (
					<Alert variant="destructive">
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}
				<div className="mb-4">
					{selectedImage ? (
						<div className="aspect-square relative rounded-2xl overflow-hidden bg-muted">
							<Image
								src={selectedImage}
								alt="Selected image"
								fill
								className="object-cover"
							/>
						</div>
					) : (
						<label className="block aspect-square rounded-2xl border-2 border-dashed border-muted-foreground/25 hover:border-muted-foreground/50 transition-colors cursor-pointer">
							<input
								type="file"
								accept="image/*"
								className="hidden"
								onChange={handleImageUpload}
							/>
							<div className="flex items-center justify-center h-full">
								<span className="text-muted-foreground">
									Click to upload file
								</span>
							</div>
						</label>
					)}
				</div>

				<Input
					type="text"
					placeholder="Add a title"
					className="text-lg font-semibold bg-transparent border-none px-0 placeholder:text-muted-foreground mb-4 p-2"
					value={title}
					onChange={(e) => setTitle(e.target.value)}
				/>

				<Textarea
					placeholder="Write a description..."
					className="min-h-[100px] bg-transparent border-none resize-none px-0 placeholder:text-muted-foreground mb-4 p-2"
					value={description}
					onChange={(e) => setDescription(e.target.value)}
				/>

				{isLoading && (
					<div className="flex items-center justify-center">
						<Ellipsis className="w-4 h-4 animate-spin" />
					</div>
				)}

				<Button
					className="w-full bg-[#5B51E6] hover:bg-[#4A41D4] text-white"
					size="lg"
					disabled={isLoading}
				>
					Continue
				</Button>
			</form>
		</main>
	);
}
