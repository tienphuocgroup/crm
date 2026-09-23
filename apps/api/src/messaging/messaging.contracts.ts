import { MESSAGING_POLICY } from "@crm/db/messaging";
import { z } from "zod";
import { MESSAGING_API } from "./messaging-config";

export type MessagingEligibility =
	| { mode: "free-text"; windowClosesAt: string }
	| { mode: "blocked"; reason: string };

export const MESSAGING_FILTERS = ["all", "needsReply", "unmatched"] as const;

export type MessagingFilter = (typeof MESSAGING_FILTERS)[number];

export const messagingThreadsInput = z.object({
	cursor: z.string().optional(),
	limit: z
		.number()
		.int()
		.min(1)
		.max(MESSAGING_API.threads.maxPageSize)
		.default(MESSAGING_API.threads.pageSize),
	filter: z.enum(MESSAGING_FILTERS).default("all"),
});

export type MessagingThreadsInput = z.infer<typeof messagingThreadsInput>;

export const messagingMessagesInput = z.object({
	threadId: z.string().min(1),
	cursor: z.string().optional(),
	limit: z
		.number()
		.int()
		.min(1)
		.max(MESSAGING_API.threads.maxPageSize)
		.default(MESSAGING_API.messages.pageSize),
});

export type MessagingMessagesInput = z.infer<typeof messagingMessagesInput>;

export const messagingThreadByContactInput = z.object({
	contactId: z.string().min(1),
});

export const messagingThreadIdInput = z.object({
	threadId: z.string().min(1),
});

export const messagingLinkContactInput = z.object({
	threadId: z.string().min(1),
	contactId: z.string().min(1),
});

export const messagingSendInput = z.object({
	threadId: z.string().min(1),
	body: z.string().trim().min(1).max(MESSAGING_POLICY.maxBodyLength),
	clientRequestId: z.string().uuid(),
});

export type MessagingSendInput = z.infer<typeof messagingSendInput>;
