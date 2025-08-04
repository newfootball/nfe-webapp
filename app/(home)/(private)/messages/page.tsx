import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getSession } from "@/src/lib/auth-server";
import { MessageHeader } from "./components/message-header";
import { MessageList } from "./components/message-list";
import { UserList } from "./components/user-list";
import { getMessagesGroupedByUser, getUsersWithMessages } from "./queries";

export default async function MessagesPage() {
	const session = await getSession();
	const users = session?.user?.id
		? await getUsersWithMessages(session.user.id)
		: [];
	const groupedMessages = session?.user?.id
		? await getMessagesGroupedByUser(session.user.id)
		: {};

	// Transformer les messages groupés en un tableau plat
	const messages = Object.values(groupedMessages).flat();

	return (
		<div className="min-h-screen bg-background flex flex-col">
			<MessageHeader />

			<main className="container p-4 flex-grow">
				<UserList users={users} />

				<Tabs defaultValue="messages" className="w-full mb-6">
					<TabsList className="w-full grid grid-cols-2 h-11 p-1 bg-muted">
						<TabsTrigger
							value="messages"
							className="data-[state=active]:bg-background rounded-sm"
						>
							Messages
						</TabsTrigger>
						<TabsTrigger
							value="favorites"
							className="data-[state=active]:bg-background rounded-sm"
						>
							Favorites
						</TabsTrigger>
					</TabsList>
				</Tabs>

				<MessageList messages={messages} />
			</main>
		</div>
	);
}
