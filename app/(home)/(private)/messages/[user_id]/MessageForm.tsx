"use client";

import { Send } from "lucide-react";
import { useState, useTransition } from "react";
import { sendMessage } from "./actions";

interface MessageFormProps {
	toUserId: string;
}

export function MessageForm({ toUserId }: MessageFormProps) {
	const [content, setContent] = useState("");
	const [isPending, startTransition] = useTransition();

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!content.trim() || isPending) return;

		const formData = new FormData();
		formData.append("content", content.trim());
		formData.append("toUserId", toUserId);

		startTransition(async () => {
			const result = await sendMessage(formData);
			if (result.success) {
				setContent("");
			} else {
				console.error(result.error);
			}
		});
	};

	return (
		<form onSubmit={handleSubmit} className="flex gap-2">
			<input
				type="text"
				name="content"
				value={content}
				onChange={(e) => setContent(e.target.value)}
				placeholder="Écrivez votre message..."
				className="flex-1 rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none"
				disabled={isPending}
			/>
			<button
				type="submit"
				disabled={isPending || !content.trim()}
				className="rounded-lg bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
			>
				<Send className="h-5 w-5" />
			</button>
		</form>
	);
}
