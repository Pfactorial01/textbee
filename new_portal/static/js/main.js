// Add custom JavaScript here
document.addEventListener("DOMContentLoaded", function () {
	// Initialize any JavaScript functionality
	console.log("SMS Portal loaded");

	// Initialize device selection
	const deviceSelect = document.getElementById("deviceSelect");
	if (deviceSelect) {
		// Load previously selected device
		const savedDeviceId = localStorage.getItem("selectedDeviceId");

		if (savedDeviceId) {
			const options = deviceSelect.options;
			for (let i = 0; i < options.length; i++) {
				if (options[i].value === savedDeviceId) {
					deviceSelect.selectedIndex = i;
					break;
				}
			}
		} else {
			// If no device was previously selected, select the first non-disabled option
			const firstDevice = deviceSelect.querySelector(
				"option:not([disabled])"
			);
			if (firstDevice) {
				firstDevice.selected = true;
				const deviceIdToStore = firstDevice.value;
				localStorage.setItem("selectedDeviceId", deviceIdToStore);
			}
		}

		// Handle device selection
		deviceSelect.addEventListener("change", function () {
			const selectedDeviceId = this.value;
			if (selectedDeviceId) {
				localStorage.setItem("selectedDeviceId", selectedDeviceId);
				// Reload page to update context
				window.location.reload();
			}
		});
	}

	// Chat functionality
	if (document.querySelector(".chat-container")) {
		const contactsList = document.getElementById("contactsList");
		const chatMessages = document.getElementById("chatMessages");
		const messageForm = document.getElementById("messageForm");
		const messageInput = document.getElementById("messageInput");
		const contactSearch = document.getElementById("contactSearch");
		const currentChatContact =
			document.getElementById("currentChatContact");
		const noChatSelected = document.getElementById("noChatSelected");

		// Fetch and display contacts
		async function fetchContacts() {
			const deviceId = localStorage.getItem("selectedDeviceId");
			if (!deviceId) {
				contactsList.innerHTML =
					'<div class="p-3 text-muted">Please select a device first</div>';
				return;
			}

			try {
				const response = await fetch(
					`http://100.77.145.14:3005/api/v1/gateway/devices/${deviceId}/getContacts`,
					{
						headers: {
							Authorization: `Bearer ${
								document.cookie
									.split("; ")
									.find((row) =>
										row.startsWith("client_access_token=")
									)
									?.split("=")[1]
							}`,
						},
					}
				);

				if (!response.ok) throw new Error("Failed to fetch contacts");

				const data = await response.json();
				const contacts = data.data;

				// Sort contacts: unread first, then by timestamp
				contacts.sort((a, b) => {
					// First sort by read status
					if (a.read === false && b.read !== false) return -1;
					if (b.read === false && a.read !== false) return 1;

					// Then sort by timestamp
					const timeA = new Date(a.lastMessageCreatedAt);
					const timeB = new Date(b.lastMessageCreatedAt);
					return timeB - timeA; // Most recent first
				});

				// Clear existing contacts
				contactsList.innerHTML = "";

				// Create contacts list
				const listGroup = document.createElement("div");
				listGroup.className = "list-group list-group-flush";

				contacts.forEach((contact) => {
					const contactItem = document.createElement("a");
					contactItem.href = "#";
					contactItem.className =
						"list-group-item list-group-item-action";
					contactItem.dataset.phone = contact._id;

					const formattedTime = new Date(
						contact.lastMessageCreatedAt
					).toLocaleString([], {
						hour: "2-digit",
						minute: "2-digit",
						month: "short",
						day: "numeric",
					});

					contactItem.innerHTML = `
						<div class="d-flex w-100 justify-content-between align-items-start">
							<div class="flex-grow-1 min-width-0">
								<div class="d-flex align-items-center">
									<h6 class="mb-1 text-truncate">
										${contact._id}
										${
											contact.read === false
												? '<span class="badge bg-primary ms-2">New</span>'
												: ""
										}
									</h6>
								</div>
								<p class="mb-1 text-truncate text-muted small">
									${
										contact.lastMessageType === "SENT"
											? '<i class="bi bi-arrow-right-short"></i>'
											: '<i class="bi bi-arrow-left-short"></i>'
									}
									${contact.lastMessage || "No messages"}
								</p>
							</div>
							<small class="text-muted ms-2 flex-shrink-0">
								${formattedTime}
							</small>
						</div>
					`;

					listGroup.appendChild(contactItem);
				});

				contactsList.appendChild(listGroup);
			} catch (error) {
				console.error("Error fetching contacts:", error);
				contactsList.innerHTML = `
					<div class="alert alert-danger m-3" role="alert">
						Failed to load contacts: ${error.message}
					</div>
				`;
			}
		}

		// Initial contacts load
		fetchContacts();

		// Handle contact selection
		contactsList.addEventListener("click", function (e) {
			const contact = e.target.closest(".list-group-item");
			if (!contact) return;

			// Remove active class from all contacts
			contactsList
				.querySelectorAll(".list-group-item")
				.forEach((item) => {
					item.classList.remove("active");
				});

			// Add active class to selected contact
			contact.classList.add("active");

			// Enable message input
			messageInput.disabled = false;
			document.getElementById("sendButton").disabled = false;

			// Update current chat contact
			currentChatContact.textContent = contact.dataset.phone;
			noChatSelected.style.display = "none";

			// Load chat messages for this contact
			loadChatMessages(contact.dataset.phone);
		});

		// Handle message sending
		messageForm.addEventListener("submit", async function (e) {
			e.preventDefault();
			const message = messageInput.value.trim();
			if (!message) return;

			const deviceId = localStorage.getItem("selectedDeviceId");
			const recipient = currentChatContact.textContent;

			// Disable send button and input while sending
			const sendButton = document.getElementById("sendButton");
			messageInput.disabled = true;
			sendButton.disabled = true;

			try {
				const response = await fetch(
					`http://100.77.145.14:3005/api/v1/gateway/devices/${deviceId}/send-sms`,
					{
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							Authorization: `Bearer ${
								document.cookie
									.split("; ")
									.find((row) =>
										row.startsWith("client_access_token=")
									)
									?.split("=")[1]
							}`,
						},
						body: JSON.stringify({
							message: message,
							recipients: [recipient],
						}),
					}
				);

				if (!response.ok) {
					throw new Error("Failed to send message");
				}

				// Add message to chat
				addMessage(message, true);

				// Clear input
				messageInput.value = "";

				// Refresh contacts to update last message
				fetchContacts();
			} catch (error) {
				console.error("Error sending message:", error);
				// Show error message
				const errorDiv = document.createElement("div");
				errorDiv.className = "alert alert-danger m-3";
				errorDiv.textContent = `Failed to send message: ${error.message}`;
				chatMessages.appendChild(errorDiv);

				// Auto-remove error message after 5 seconds
				setTimeout(() => {
					errorDiv.remove();
				}, 5000);
			} finally {
				// Re-enable input and button
				messageInput.disabled = false;
				sendButton.disabled = false;
				messageInput.focus();
			}
		});

		// Handle contact search
		contactSearch.addEventListener("input", function (e) {
			const searchTerm = e.target.value.toLowerCase();
			const contacts = contactsList.querySelectorAll(".list-group-item");

			contacts.forEach((contact) => {
				const phone = contact.dataset.phone.toLowerCase();
				const visible = phone.includes(searchTerm);
				contact.style.display = visible ? "block" : "none";
			});
		});

		// Function to load chat messages (implement API integration)
		async function loadChatMessages(phoneNumber) {
			// Clear existing messages
			chatMessages.innerHTML = "";

			const deviceId = localStorage.getItem("selectedDeviceId");
			if (!deviceId || !phoneNumber) return;

			try {
				const response = await fetch(
					`http://100.77.145.14:3005/api/v1/gateway/devices/${deviceId}/${phoneNumber}/getChat`,
					{
						headers: {
							Authorization: `Bearer ${
								document.cookie
									.split("; ")
									.find((row) =>
										row.startsWith("client_access_token=")
									)
									?.split("=")[1]
							}`,
						},
					}
				);

				if (!response.ok) throw new Error("Failed to fetch messages");

				const data = await response.json();
				const messages = data.data;

				// Create a container for messages
				const messagesContainer = document.createElement("div");
				messagesContainer.className = "messages-container";

				// Sort messages by timestamp (oldest first)
				messages.sort((a, b) => {
					const timeA = new Date(a.createdAt);
					const timeB = new Date(b.createdAt);
					return timeA - timeB; // Ascending order (oldest first)
				});

				// Display messages
				messages.forEach((msg) => {
					const isSent = msg.type === "SENT";
					const timestamp = new Date(msg.createdAt).toLocaleString(
						[],
						{
							hour: "2-digit",
							minute: "2-digit",
							year: "2-digit",
							month: "2-digit",
							day: "2-digit",
						}
					);

					const messageDiv = document.createElement("div");
					messageDiv.className = `message message-${
						isSent ? "sent" : "received"
					}`;

					const messageText = document.createElement("div");
					messageText.className = "message-text";
					messageText.textContent = msg.message;

					const messageTime = document.createElement("div");
					messageTime.className = "message-time";
					messageTime.textContent = timestamp;

					messageDiv.appendChild(messageText);
					messageDiv.appendChild(messageTime);
					messagesContainer.appendChild(messageDiv);
				});

				// Add all messages to the chat
				chatMessages.appendChild(messagesContainer);

				// Scroll to bottom to show latest messages
				chatMessages.scrollTop = chatMessages.scrollHeight;
			} catch (error) {
				console.error("Error fetching messages:", error);
				chatMessages.innerHTML = `
					<div class="alert alert-danger m-3" role="alert">
						Failed to load messages: ${error.message}
					</div>
				`;
			}
		}

		// Update the addMessage function to maintain order
		function addMessage(text, sent = false) {
			const messageDiv = document.createElement("div");
			messageDiv.className = `message message-${
				sent ? "sent" : "received"
			}`;

			const messageText = document.createElement("div");
			messageText.className = "message-text";
			messageText.textContent = text;

			const messageTime = document.createElement("div");
			messageTime.className = "message-time";
			messageTime.textContent = new Date().toLocaleString([], {
				hour: "2-digit",
				minute: "2-digit",
				year: "2-digit",
				month: "2-digit",
				day: "2-digit",
			});

			messageDiv.appendChild(messageText);
			messageDiv.appendChild(messageTime);

			// Add to the end of the messages container
			const messagesContainer =
				chatMessages.querySelector(".messages-container") ||
				chatMessages;
			messagesContainer.appendChild(messageDiv);

			// Scroll to bottom to show new message
			chatMessages.scrollTop = chatMessages.scrollHeight;
		}
	}

	// New Chat Button functionality
	const newChatButton = document.getElementById("newChatButton");
	const newChatForm = document.getElementById("newChatForm");

	newChatForm.addEventListener("submit", async function (e) {
		e.preventDefault();
		const phoneNumber = document.getElementById("phoneNumber").value.trim();
		const message = document.getElementById("message").value.trim();

		if (phoneNumber && message) {
			const deviceId = localStorage.getItem("selectedDeviceId");

			// Disable the button while sending
			const sendButton = document.getElementById("sendButton");
			sendButton.disabled = true;

			try {
				const response = await fetch(
					`http://100.77.145.14:3005/api/v1/gateway/devices/${deviceId}/send-sms`,
					{
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							Authorization: `Bearer ${
								document.cookie
									.split("; ")
									.find((row) =>
										row.startsWith("client_access_token=")
									)
									?.split("=")[1]
							}`,
						},
						body: JSON.stringify({
							message: message,
							recipients: [phoneNumber],
						}),
					}
				);

				if (!response.ok) {
					throw new Error("Failed to send message");
				}

				// Refresh the page to update context
				window.location.reload();
			} catch (error) {
				console.error("Error sending message:", error);
				alert(`Failed to send message: ${error.message}`);
			} finally {
				// Re-enable button
				sendButton.disabled = false;
			}
		} else {
			alert("Please provide both a phone number and a message.");
		}
	});
});
