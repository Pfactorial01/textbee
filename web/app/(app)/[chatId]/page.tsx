import { ChatView } from "./ChatView";

export default async function ChatPage({ params: { chatId } }) {
	const [deviceId, number] = chatId.split("_");
	const chatsData = await fetch(
		`${process.env.NEXT_PUBLIC_API_BASE_URL}/gateway/devices/${deviceId}/${number}/getChat`
	);
	const chats = await chatsData.json();
	console.log(chats.data);
	return (
		<main className="container mx-auto max-w-2xl">
			<ChatView initialMessages={chats.data} />
		</main>
	);
}
