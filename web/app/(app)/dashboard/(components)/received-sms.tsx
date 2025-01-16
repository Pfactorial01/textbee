import { Tabs, TabsList, TabsContent, TabsTrigger } from "@/components/ui/tabs";
import { ApiEndpoints } from "@/config/api";
import httpBrowserClient from "@/lib/httpBrowserClient";
import { useQuery } from "@tanstack/react-query";
import { Heart } from "lucide-react";
import React, { useEffect, useState } from "react";
import CommunityAlert from "./community-alert";
import { Card, CardContent } from "@/components/ui/card";
import { Phone, Clock, MessageSquare } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import Link from "next/link";

export function ReceivedSmsCard({ sms }) {
	const formattedDate = new Date(sms.receivedAt).toLocaleString("en-US", {
		hour: "2-digit",
		minute: "2-digit",
		day: "numeric",
		month: "short",
		year: "numeric",
	});

	return (
		<Link href={`${sms.device._id}_${sms.sender}`}>
			<Card className="hover:bg-muted/50 transition-colors max-w-sm md:max-w-none">
				<CardContent className="p-4">
					<div className="space-y-3">
						<div className="flex justify-between items-start">
							<div className="flex items-center gap-2">
								<span className="font-medium">
									{sms.sender}
								</span>
							</div>
							<div className="flex items-center gap-1 text-sm text-muted-foreground">
								<Clock className="h-3 w-3" />
								<span>{formattedDate}</span>
							</div>
						</div>

						<div className="flex gap-2">
							<p className="text-sm max-w-sm md:max-w-none">
								{sms.message}
							</p>
						</div>
					</div>
				</CardContent>
			</Card>
		</Link>
	);
}

export default function ReceivedSms() {
	const {
		data: devices,
		isLoading: isLoadingDevices,
		error: devicesError,
	} = useQuery({
		queryKey: ["devices"],
		queryFn: () =>
			httpBrowserClient
				.get(ApiEndpoints.gateway.listDevices())
				.then((res) => res.data),
	});

	const handleTabChange = (tab: string) => {
		setCurrentTab(tab);
	};

	const [currentTab, setCurrentTab] = useState("");

	useEffect(() => {
		if (devices?.data?.length) {
			setCurrentTab(devices?.data?.[0]?._id);
		}
	}, [devices]);

	const {
		data: receivedSms,
		isLoading: isLoadingReceivedSms,
		error: receivedSmsError,
	} = useQuery({
		queryKey: ["received-sms", currentTab],
		enabled: !!currentTab,
		queryFn: () =>
			httpBrowserClient
				.get(ApiEndpoints.gateway.getReceivedSMS(currentTab))
				.then((res) => res.data),
	});
	//   const smss =   [
	//     {
	//         "_id": "677fb6da752fe378755b5d2f",
	//         "device": {
	//             "_id": "677fb41e752fe378755b5cd2",
	//             "enabled": true,
	//             "brand": "samsung",
	//             "model": "SM-A525F",
	//             "buildId": "UP1A.231005.007"
	//         },
	//         "message": "Reverse testing 2",
	//         "encrypted": false,
	//         "type": "RECEIVED",
	//         "sender": "+2348107482426",
	//         "receivedAt": "2025-01-09T11:45:08.000Z",
	//         "createdAt": "2025-01-09T11:45:30.994Z",
	//         "updatedAt": "2025-01-09T11:45:30.994Z",
	//         "__v": 0
	//     },
	//     {
	//         "_id": "677fb6da752fe378755b5d2f",
	//         "device": {
	//             "_id": "677fb41e752fe378755b5cd2",
	//             "enabled": true,
	//             "brand": "samsung",
	//             "model": "SM-A525F",
	//             "buildId": "UP1A.231005.007"
	//         },
	//         "message": "Reverse testing 3",
	//         "encrypted": false,
	//         "type": "RECEIVED",
	//         "sender": "+2348107482426",
	//         "receivedAt": "2025-01-09T11:46:08.000Z",
	//         "createdAt": "2025-01-09T11:45:30.994Z",
	//         "updatedAt": "2025-01-09T11:45:30.994Z",
	//         "__v": 0
	//     },
	//     {
	//         "_id": "677fb6da752fe378755b5d2f",
	//         "device": {
	//             "_id": "677fb41e752fe378755b5cd2",
	//             "enabled": true,
	//             "brand": "samsung",
	//             "model": "SM-A525F",
	//             "buildId": "UP1A.231005.007"
	//         },
	//         "message": "Reverse testing 1",
	//         "encrypted": false,
	//         "type": "RECEIVED",
	//         "sender": "+23481074824232",
	//         "receivedAt": "2025-01-10T11:45:08.000Z",
	//         "createdAt": "2025-01-09T11:45:30.994Z",
	//         "updatedAt": "2025-01-09T11:45:30.994Z",
	//         "__v": 0
	//     }
	// ]
	const uniqueSenders = {};

	receivedSms?.data?.forEach((sms) => {
		if (!uniqueSenders[sms.sender]) {
			uniqueSenders[sms.sender] = [];
		}
		uniqueSenders[sms.sender].push(sms);
	});

	// Sort messages within each sender
	for (const sender in uniqueSenders) {
		uniqueSenders[sender].sort(
			(a, b) => new Date(b.receivedAt) - new Date(a.receivedAt)
		);
	}

	// Sort senders based on the latest message's receivedAt
	const sortedSenders = Object.entries(uniqueSenders).sort(
		([, messagesA], [, messagesB]) => {
			const latestA =
				messagesA.length > 0 ? new Date(messagesA[0].receivedAt) : null;
			const latestB =
				messagesB.length > 0 ? new Date(messagesB[0].receivedAt) : null;

			if (latestA === null && latestB === null) return 0;
			if (latestA === null) return 1;
			if (latestB === null) return -1;

			return latestB - latestA;
		}
	);

	// Convert to an array of objects
	const sortedUniqueSenders = sortedSenders.map(([sender, messages]) => ({
		sender,
		messages,
	}));

	console.log(sortedUniqueSenders);
	if (isLoadingDevices)
		return (
			<div className="flex justify-center items-center h-full">
				<Spinner size="sm" />
			</div>
		);
	if (devicesError)
		return (
			<div className="flex justify-center items-center h-full">
				Error: {devicesError.message}
			</div>
		);
	if (!devices?.data?.length)
		return (
			<div className="flex justify-center items-center h-full">
				No devices found
			</div>
		);

	return (
		<div>
			<Select value={currentTab} onValueChange={handleTabChange}>
				<SelectTrigger className="w-full">
					<SelectValue placeholder="select device" />
				</SelectTrigger>
				<SelectContent>
					{devices?.data?.map((device) => (
						<SelectItem
							key={device._id}
							value={device._id}
							className="flex-1"
						>
							{device.brand} {device.model}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<div className="flex flex-col gap-2 mt-3">
				{isLoadingReceivedSms && (
					<div className="flex justify-center items-center h-full">
						<Spinner size="sm" />
					</div>
				)}
				{receivedSmsError && (
					<div className="flex justify-center items-center h-full">
						Error: {receivedSmsError.message}
					</div>
				)}
				{!isLoadingReceivedSms && !receivedSms?.data?.length && (
					<div className="flex justify-center items-center h-full">
						No messages found
					</div>
				)}
				{sortedUniqueSenders.map((sender, index) => (
					<ReceivedSmsCard key={index} sms={sender.messages[0]} />
				))}
			</div>
		</div>
	);
}
