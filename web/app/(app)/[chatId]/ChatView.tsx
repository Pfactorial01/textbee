"use client";

import { useState, useRef, useEffect } from "react";
import { Message } from "./Message";

interface ChatMessage {
	_id: string;
	message: string;
	type: "SENT" | "RECEIVED";
	createdAt: string;
}

export function ChatView({
	initialMessages,
}: {
	initialMessages: ChatMessage[];
}) {
	const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
	const [newMessage, setNewMessage] = useState("");
	const messagesEndRef = useRef<HTMLDivElement>(null);

	const scrollToBottom = () => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	};

	useEffect(scrollToBottom, [messages]);

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (newMessage.trim()) {
			const message: ChatMessage = {
				_id: Date.now().toString(),
				message: newMessage,
				type: "SENT",
				createdAt: new Date().toISOString(),
			};
			setMessages([...messages, message]);
			setNewMessage("");
		}
	};

	return (
		<div className="flex flex-col h-screen bg-gray-100">
			<div className="flex-1 overflow-y-auto p-4">
				{messages.map((msg) => (
					<Message
						key={msg._id}
						message={msg.message}
						type={msg.type}
						timestamp={msg.createdAt}
					/>
				))}
				<div ref={messagesEndRef} />
			</div>
			<form onSubmit={handleSubmit} className="p-4 bg-white border-t">
				<div className="flex">
					<input
						type="text"
						value={newMessage}
						onChange={(e) => setNewMessage(e.target.value)}
						placeholder="Type a message..."
						className="flex-1 p-2 border rounded-l-md focus:outline-none focus:ring-2 focus:ring-blue-500"
					/>
					<button
						type="submit"
						className="bg-blue-500 text-white px-4 py-2 rounded-r-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
					>
						Send
					</button>
				</div>
			</form>
		</div>
	);
}
