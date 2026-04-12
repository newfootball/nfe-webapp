import { format } from "date-fns";
import { fr } from "date-fns/locale";
import Image from "next/image";
import { redirect } from "next/navigation";
import { getSession } from "@/src/lib/auth-server";
import { prisma } from "@/src/lib/prisma";
import { MessageForm } from "./MessageForm";

export default async function page({
	params,
}: {
	params: Promise<{ user_id: string }>;
}) {
	const [session, { user_id }] = await Promise.all([getSession(), params]);

	if (!session) {
		redirect("/sign-in");
	}

	const messages = await prisma.message.findMany({
		where: {
			OR: [
				{ fromUserId: session.user.id, toUserId: user_id },
				{ fromUserId: user_id, toUserId: session.user.id },
			],
		},
		include: {
			fromUser: {
				select: {
					id: true,
					name: true,
					image: true,
				},
			},
			toUser: {
				select: {
					id: true,
					name: true,
					image: true,
				},
			},
		},
		orderBy: {
			createdAt: "asc",
		},
	});

	return (
		<>
			<div className="p-4 space-y-4 pb-32">
				{messages.map((message) => {
					const isOwnMessage = message.fromUserId === session.user.id;
					return (
						<div
							key={message.id}
							className={`flex ${isOwnMessage ? "justify-end" : "justify-start"}`}
						>
							<div
								className={`flex items-end gap-2 max-w-[75%] ${isOwnMessage ? "flex-row-reverse" : "flex-row"}`}
							>
								<div className="relative w-8 h-8 rounded-full overflow-hidden shrink-0">
									<Image
										src={message.fromUser.image || "/default-avatar.png"}
										alt={message.fromUser.name || "Utilisateur"}
										fill
										className="object-cover"
									/>
								</div>
								<div
									className={`rounded-2xl px-4 py-2.5 ${
										isOwnMessage
											? "bg-primary text-primary-foreground rounded-br-sm"
											: "bg-muted text-foreground rounded-bl-sm"
									}`}
								>
									<p className="text-sm">{message.content}</p>
									<p className="text-[10px] mt-1 opacity-60">
										{format(new Date(message.createdAt), "HH:mm", {
											locale: fr,
										})}
									</p>
								</div>
							</div>
						</div>
					);
				})}
			</div>

			<div className="fixed bottom-20 inset-x-0 bg-background/95 backdrop-blur border-t border-border p-3">
				<div className="max-w-2xl mx-auto">
					<MessageForm toUserId={user_id} />
				</div>
			</div>
		</>
	);
}
