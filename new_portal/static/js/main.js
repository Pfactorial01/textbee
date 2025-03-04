document.addEventListener("DOMContentLoaded", function () {
	// Initialize any JavaScript functionality
	console.log("SMS Portal loaded new");

	// Function to load chat messages (implement API integration)
	async function loadChatMessages(phoneNumber, chatMessages) {
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
				const timestamp = new Date(msg.createdAt).toLocaleString([], {
					hour: "2-digit",
					minute: "2-digit",
					year: "2-digit",
					month: "2-digit",
					day: "2-digit",
				});

				const messageDiv = document.createElement("div");
				messageDiv.className = `message message-${
					isSent ? "sent" : "received"
				}`;
				messageDiv.id = msg._id;
				messageDiv.style.cursor = "pointer";

				// Create a checkbox instead of a radio button
				const checkbox = document.createElement("input");
				checkbox.type = "checkbox";
				checkbox.name = "selectedMessage"; // Group name for checkboxes
				checkbox.style.display = "none"; // Initially hidden
				checkbox.style.marginRight = "10px"; // Add some space between checkbox and message text

				// Show checkboxes when one message is clicked
				messageDiv.addEventListener("click", () => {
					if (checkbox.style.display === "none") {
						// Show all checkboxes
						const allCheckboxes =
							messagesContainer.querySelectorAll(
								'input[name="selectedMessage"]'
							);
						allCheckboxes.forEach((cb) => {
							cb.style.display = "inline"; // Show all checkboxes
						});
					}
					checkbox.checked = !checkbox.checked; // Toggle the checkbox state

					// Check if any checkbox is checked
					const anyChecked = Array.from(
						messagesContainer.querySelectorAll(
							'input[name="selectedMessage"]'
						)
					).some((cb) => cb.checked);
					// Show or hide the delete icon based on selection
					deleteIcon.style.display = anyChecked ? "inline" : "none"; // Show or hide the icon
					contactBanner.appendChild(deleteIcon); // Ensure delete icon is inside currentChatContact

					if (!anyChecked) {
						// If no checkboxes are checked, hide them
						const allCheckboxes =
							messagesContainer.querySelectorAll(
								'input[name="selectedMessage"]'
							);
						allCheckboxes.forEach((cb) => {
							cb.style.display = "none"; // Hide all checkboxes
						});
					}
				});

				const messageText = document.createElement("div");
				messageText.className = "message-text";
				messageText.textContent = msg.message;

				const messageTime = document.createElement("div");
				messageTime.className = "message-time";
				messageTime.textContent = timestamp;

				// Append checkbox and message contents
				messageDiv.appendChild(checkbox); // Append checkbox to message div
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
		const contactBanner = document.getElementById("contactBanner");
		const noChatSelected = document.getElementById("noChatSelected");
		const deleteIcon = document.getElementById("deleteIcon"); // Define deleteIcon

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
						<div id="contactItemInner" class="d-flex w-100 justify-content-between align-items-start">
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
							<!-- Delete icon -->
							<i class="bi bi-trash delete-icon" id="deleteConversationIcon" style="display: none; margin-left: 3px;"></i>
						</div>
					`;
					contactItem.id = contact._id;

					// Add hover effect to show delete icon
					contactItem.addEventListener("mouseenter", () => {
						contactItem.querySelector(
							".delete-icon"
						).style.display = "inline";
					});
					contactItem.addEventListener("mouseleave", () => {
						contactItem.querySelector(
							".delete-icon"
						).style.display = "none";
					});

					// Set contact ID as a data attribute on the delete icon
					const deleteConversationIcon = contactItem.querySelector(
						"#deleteConversationIcon"
					);
					deleteConversationIcon.dataset.contactId = contact._id; // Store contact ID

					// Attach click event to deleteConversationIcon
					deleteConversationIcon.addEventListener(
						"click",
						async function (e) {
							e.stopPropagation(); // Prevent triggering the contact selection
							const deviceId =
								localStorage.getItem("selectedDeviceId");
							const contactId = this.dataset.contactId; // Access the contact ID
							const contactItemInner =
								contactItem.querySelector("#contactItemInner");

							// Show loading spinner in place of deleteConversationIcon
							const loadingSpinner =
								document.createElement("div");
							loadingSpinner.className = "spinner-border"; // Add appropriate classes for styling
							loadingSpinner.role = "status";
							loadingSpinner.style.width = "0.5rem"; // Set width to make it smaller
							loadingSpinner.style.height = "0.5rem"; // Set height to make it smaller
							loadingSpinner.innerHTML =
								'<span class="visually-hidden">Loading...</span>'; // Accessibility

							this.style.display = "none"; // Hide the delete icon
							contactItemInner.appendChild(loadingSpinner); // Add spinner to the contact banner

							try {
								const response = await fetch(
									`http://100.77.145.14:3005/api/v1/gateway/devices/${deviceId}/delete-conversation`,
									{
										method: "POST",
										headers: {
											"Content-Type": "application/json",
											Authorization: `Bearer ${
												document.cookie
													.split("; ")
													.find((row) =>
														row.startsWith(
															"client_access_token="
														)
													)
													?.split("=")[1]
											}`,
										},
										body: JSON.stringify({ contactId }), // Pass contact ID in the request body
									}
								);

								if (!response.ok) {
									throw new Error(
										"Failed to delete conversation"
									);
								}

								// Show initial elements after successful deletion
								currentChatContact.textContent =
									"Select a contact";
								chatMessages.innerHTML = ""; // Clear messages
								noChatSelected.style.display = "block";

								// Refresh contacts to update the list
								fetchContacts();
							} catch (error) {
								console.error(
									"Error deleting conversation:",
									error
								);
								alert(
									`Failed to delete conversation: ${error.message}`
								);
							} finally {
								// Restore the delete icon
								loadingSpinner.remove(); // Remove the spinner
								this.style.display = "inline"; // Show the delete icon again
							}
						}
					);

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
			loadChatMessages(contact.dataset.phone, chatMessages);
		});

		// Handle message sending
		messageForm.addEventListener("submit", async function (e) {
			e.preventDefault();
			const message = messageInput.value.trim();

			// Get the selected media type
			const isUrlOption = document.getElementById("urlOption").checked;
			let mediaFile = null;
			let mediaUrl = null;

			if (isUrlOption) {
				mediaUrl = document
					.getElementById("mediaUrlInputNormal")
					.value.trim();
			} else {
				mediaFile =
					document.getElementById("mediaUploadNormal").files[0];
			}

			if (!message && !mediaFile && !mediaUrl) return;

			const deviceId = localStorage.getItem("selectedDeviceId");
			const recipient = currentChatContact.textContent;

			// Disable form elements while sending
			const sendButton = document.getElementById("sendButton");
			messageInput.disabled = true;
			sendButton.disabled = true;
			mediaUploadBtn.disabled = true;

			try {
				console.log({
					message,
					recipient,
					mediaFile,
					mediaUrl,
					isUrlOption,
				});
				const formData = new FormData();
				formData.append("message", message);
				formData.append("recipients[]", recipient);

				// Add media - either file or URL
				if (isUrlOption && mediaUrl) {
					formData.append("mediaUrl", mediaUrl);
				} else if (!isUrlOption && mediaFile) {
					formData.append("media", mediaFile);
				}

				const response = await fetch(
					`http://100.77.145.14:3005/api/v1/gateway/devices/${deviceId}/send-sms`,
					{
						method: "POST",
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
						body: formData,
					}
				);

				if (!response.ok) {
					throw new Error("Failed to send message");
				}

				// Clear form
				messageInput.value = "";
				document.getElementById("mediaUploadNormal").value = "";
				document.getElementById("mediaUrlInputNormal").value = "";
				mediaPreview.style.display = "none";
				previewImage.src = "";
				previewVideo.src = "";

				// Close media modal if open
				const mediaModal = bootstrap.Modal.getInstance(
					document.getElementById("mediaModal")
				);
				if (mediaModal) {
					mediaModal.hide();
				}
				// Add message to chat
				addMessage(message, true);
				// Refresh contacts to update last message
				fetchContacts();
			} catch (error) {
				console.error("Error sending message:", error);
				const errorDiv = document.createElement("div");
				errorDiv.className = "alert alert-danger m-3";
				errorDiv.textContent = `Failed to send message: ${error.message}`;
				chatMessages.appendChild(errorDiv);

				setTimeout(() => {
					errorDiv.remove();
				}, 5000);
			} finally {
				// Re-enable form elements
				messageInput.disabled = false;
				sendButton.disabled = false;
				mediaUploadBtn.disabled = false;
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
	}

	// New Chat Button functionality
	const newChatButton = document.getElementById("newChatButton");
	const newChatForm = document.getElementById("newChatForm");

	newChatForm.addEventListener("submit", async function (e) {
		e.preventDefault();
		const phoneNumber = document.getElementById("phoneNumber").value.trim();
		const message = document.getElementById("message").value.trim();

		// Get the selected media type
		const isUrlOption = document.getElementById("urlOptionNewChat").checked;
		let mediaFile = null;
		let mediaUrl = null;

		if (isUrlOption) {
			mediaUrl = document
				.getElementById("mediaUrlInputNewChat")
				.value.trim();
		} else {
			mediaFile = document.getElementById("mediaUploadNewChat").files[0];
		}

		if (!phoneNumber || !message) {
			alert("Please provide both a phone number and a message.");
			return;
		}

		const deviceId = localStorage.getItem("selectedDeviceId");

		// Disable the button while sending
		const sendButton = this.querySelector("button[type=submit]");
		sendButton.disabled = true;

		try {
			console.log({
				message,
				phoneNumber,
				mediaFile,
				mediaUrl,
				isUrlOption,
			});
			const formData = new FormData();
			formData.append("message", message);
			formData.append("recipients[]", phoneNumber);

			// Add media - either file or URL
			if (isUrlOption && mediaUrl) {
				formData.append("mediaUrl", mediaUrl);
			} else if (!isUrlOption && mediaFile) {
				formData.append("media", mediaFile);
			}

			const response = await fetch(
				`http://100.77.145.14:3005/api/v1/gateway/devices/${deviceId}/send-sms`,
				{
					method: "POST",
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
					body: formData,
				}
			);

			if (!response.ok) {
				throw new Error("Failed to send message");
			}

			// Close the modal
			const modal = bootstrap.Modal.getInstance(
				document.getElementById("newChatModal")
			);
			modal.hide();

			// Refresh the page to update context
			window.location.reload();
		} catch (error) {
			console.error("Error sending message:", error);
			alert(`Failed to send message: ${error.message}`);
		} finally {
			// Re-enable button
			sendButton.disabled = false;
		}
	});

	// Function to handle delete action
	async function handleDeleteMessages() {
		const chatMessages = document.getElementById("chatMessages"); // Ensure chatMessages is defined
		const deviceId = localStorage.getItem("selectedDeviceId");
		const selectedCheckboxes = document.querySelectorAll(
			'input[name="selectedMessage"]:checked'
		);
		const selectedMessageIds = Array.from(selectedCheckboxes).map(
			(cb) => cb.closest(".message").id // Access the id of the message div
		); // Assuming each message div has an id set to msg._id

		if (selectedMessageIds.length === 0) {
			alert("No messages selected for deletion.");
			return;
		}

		// Show loading spinner in place of deleteIcon
		const loadingSpinner = document.createElement("div");
		loadingSpinner.className = "spinner-border"; // Add appropriate classes for styling
		loadingSpinner.role = "status";
		loadingSpinner.style.width = "1rem"; // Set width to make it smaller
		loadingSpinner.style.height = "1rem"; // Set height to make it smaller
		loadingSpinner.innerHTML =
			'<span class="visually-hidden">Loading...</span>'; // Accessibility

		contactBanner.appendChild(loadingSpinner); // Add spinner to the contact banner
		deleteIcon.style.display = "none"; // Hide the delete icon

		// Show loading state
		const loadingDiv = document.createElement("div");
		loadingDiv.className = "alert alert-info m-3";
		loadingDiv.textContent = "Deleting messages...";
		chatMessages.appendChild(loadingDiv);

		try {
			const response = await fetch(
				`http://100.77.145.14:3005/api/v1/gateway/devices/${deviceId}/delete-messages`,
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
					body: JSON.stringify({ messageIds: selectedMessageIds }),
				}
			);

			if (!response.ok) {
				throw new Error("Failed to delete messages");
			}

			// Show success message
			const successDiv = document.createElement("div");
			successDiv.className = "alert alert-success m-3";
			successDiv.textContent = "Messages deleted successfully.";
			chatMessages.appendChild(successDiv);

			// Optionally, refresh the chat messages or contacts
			loadChatMessages(currentChatContact.textContent, chatMessages); // Reload chat messages for the current contact
		} catch (error) {
			console.error("Error deleting messages:", error);
			const errorDiv = document.createElement("div");
			errorDiv.className = "alert alert-danger m-3";
			errorDiv.textContent = `Failed to delete messages: ${error.message}`;
			chatMessages.appendChild(errorDiv);
		} finally {
			// Remove loading state
			loadingDiv.remove();
			loadingSpinner.remove(); // Remove the spinner
			contactBanner.appendChild(deleteIcon); // Restore the delete icon
			deleteIcon.style.display = "inline"; // Show the delete icon again
		}
	}

	// Attach click event to deleteIcon
	deleteIcon.addEventListener("click", handleDeleteMessages);

	// Add these functions after the DOMContentLoaded event listener

	function handleMediaUpload(
		input,
		previewImage,
		previewVideo,
		previewContainer
	) {
		const file = input.files[0];
		if (!file) return;

		// Check file size (1MB = 1048576 bytes)
		if (file.size > 2048576) {
			alert("File size must be less than 1MB");
			input.value = "";
			return;
		}

		const reader = new FileReader();
		reader.onload = function (e) {
			if (file.type.startsWith("image/")) {
				previewImage.src = e.target.result;
				previewImage.style.display = "block";
				previewVideo.style.display = "none";
			} else if (file.type.startsWith("video/")) {
				previewVideo.src = e.target.result;
				previewVideo.style.display = "block";
				previewImage.style.display = "none";
			}
			previewContainer.style.display = "block";
		};
		reader.readAsDataURL(file);
	}

	// Inside your existing DOMContentLoaded event listener, add:
	const mediaUploadBtn = document.getElementById("mediaUploadBtn");
	const mediaInput = document.getElementById("mediaInput");
	const newChatMediaInput = document.getElementById("mediaUpload");
	const mediaPreview = document.getElementById("mediaPreview");
	const previewImage = document.getElementById("previewImage");
	const previewVideo = document.getElementById("previewVideo");
	const removeMedia = document.getElementById("removeMedia");

	mediaInput.addEventListener("change", () => {
		handleMediaUpload(mediaInput, previewImage, previewVideo, mediaPreview);
	});

	removeMedia.addEventListener("click", () => {
		mediaInput.value = "";
		mediaPreview.style.display = "none";
		previewImage.src = "";
		previewVideo.src = "";
	});
});
