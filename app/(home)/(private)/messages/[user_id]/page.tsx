import { getSession } from "@/src/lib/auth-server";
import { prisma } from "@/src/lib/prisma";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import Image from "next/image";
import { redirect } from "next/navigation";
import { MessageForm } from "./MessageForm";

export default async function page({
	params,
}: {
	params: Promise<{ user_id: string }>;
}) {
	const session = await getSession();

	if (!session) {
		redirect("/login");
	}

	const { user_id } = await params;

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
		<div className="flex flex-col h-full">
			<div className="flex-1 overflow-y-auto p-4 space-y-4">
				{messages.map((message) => {
					const isOwnMessage = message.fromUserId === session.user.id;
					return (
						<div
							key={message.id}
							className={`flex ${
								isOwnMessage ? "justify-end" : "justify-start"
							}`}
						>
							<div
								className={`flex items-start gap-2 max-w-[70%] ${
									isOwnMessage ? "flex-row-reverse" : "flex-row"
								}`}
							>
								<div className="relative w-8 h-8 rounded-full overflow-hidden">
									<Image
										src={message.fromUser.image || "/default-avatar.png"}
										alt={message.fromUser.name || "Utilisateur"}
										fill
										className="object-cover"
									/>
								</div>
								<div
									className={`rounded-lg p-3 ${
										isOwnMessage
											? "bg-blue-500 text-white"
											: "bg-gray-100 text-gray-900"
									}`}
								>
									<p className="text-sm">{message.content}</p>
									<p className="text-xs mt-1 opacity-70">
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
			<div className="border-t p-4">
				<MessageForm toUserId={user_id} />
			</div>
		</div>
	);
}
