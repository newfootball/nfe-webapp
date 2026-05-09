"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/src/lib/auth-server";
import { createNotification } from "@/src/lib/create-notification";
import { prisma } from "@/src/lib/prisma";

export async function sendMessage(formData: FormData) {
	try {
		const session = await getSession();

		if (!session) {
			throw new Error("Non autorisé");
		}

		const content = formData.get("content") as string;
		const toUserId = formData.get("toUserId") as string;

		if (!content || !toUserId) {
			throw new Error("Données manquantes");
		}

		await prisma.message.create({
			data: {
				content,
				fromUserId: session.user.id,
				toUserId,
			},
		});

		if (session.user.id !== toUserId) {
			const sender = await prisma.user.findUnique({
				where: { id: session.user.id },
				select: { name: true },
			});
			await createNotification(
				toUserId,
				"MESSAGE",
				`${sender?.name ?? "Quelqu'un"} t'a envoyé un message`,
				`/messages/${session.user.id}`,
			);
		}

		revalidatePath(`/messages/${toUserId}`);
		return { success: true };
	} catch (error) {
		console.error("[SEND_MESSAGE]", error);
		return { success: false, error: "Erreur lors de l'envoi du message" };
	}
}
