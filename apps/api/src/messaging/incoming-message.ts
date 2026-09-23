import type { MessageKind, MessagingChannel } from "@crm/db";
import { MESSAGING_POLICY } from "@crm/db/messaging";
import { z } from "zod";
import { MESSAGING_API } from "./messaging-config";

const ATTACHMENT_SCHEMES = ["http:", "https:"];

export function attachmentHostOf(value: string): string | null {
	try {
		return new URL(value).hostname.toLowerCase();
	} catch {
		return null;
	}
}

export function isAllowedAttachmentUrl(value: string): boolean {
	let url: URL;

	try {
		url = new URL(value);
	} catch {
		return false;
	}

	if (!ATTACHMENT_SCHEMES.includes(url.protocol)) return false;

	const host = url.hostname.toLowerCase();

	return MESSAGING_POLICY.zalo.attachmentHosts.some(
		(allowed) => host === allowed || host.endsWith(`.${allowed}`),
	);
}

export const messageAttachment = z.object({
	url: z
		.string()
		.max(MESSAGING_API.webhook.maxAttachmentUrlLength)
		.refine(isAllowedAttachmentUrl, {
			message: "The attachment is not on a Zalo host.",
		}),
	name: z.string().max(200).optional(),
	size: z.number().int().nonnegative().optional(),
});

export const messageAttachments = z
	.array(messageAttachment)
	.max(MESSAGING_API.webhook.maxAttachments);

export type MessageAttachment = z.infer<typeof messageAttachment>;

const attachmentUrl = z.object({ url: z.string() });

export type AttachmentIntake = {
	attachments: MessageAttachment[];
	droppedHosts: string[];
};

export function acceptAttachments(candidates: unknown[]): AttachmentIntake {
	const attachments: MessageAttachment[] = [];
	const droppedHosts: string[] = [];

	for (const candidate of candidates) {
		if (attachments.length >= MESSAGING_API.webhook.maxAttachments) break;

		const parsed = messageAttachment.safeParse(candidate);

		if (parsed.success) attachments.push(parsed.data);
		else droppedHosts.push(hostLabelOf(candidate));
	}

	return { attachments: messageAttachments.parse(attachments), droppedHosts };
}

function hostLabelOf(candidate: unknown): string {
	const parsed = attachmentUrl.safeParse(candidate);
	if (!parsed.success) return "invalid";

	const host = attachmentHostOf(parsed.data.url);

	return host && host.length > 0 ? host : "invalid";
}

export type IncomingChannelMessage = {
	channel: MessagingChannel;
	accountExternalIds: string[];
	senderExternalId: string;
	displayName: string | null;
	avatarUrl: string | null;
	kind: MessageKind;
	body: string | null;
	attachments: MessageAttachment[];
	externalId: string;
	sentAt: Date;
};

export type IdentityEvent = {
	channel: MessagingChannel;
	accountExternalId: string;
	senderExternalId: string;
	kind: "follow" | "unfollow";
	at: Date;
};

export type ReceiptEvent = {
	channel: MessagingChannel;
	accountExternalIds: string[];
	externalId: string;
	kind: "delivered" | "seen";
	at: Date;
};

export type StoreRefusal = "no-account" | "disconnected" | "duplicate";

export type StoreResult =
	| {
			stored: true;
			threadId: string;
			contactId: string | null;
			companyId: string | null;
	  }
	| { stored: false; reason: StoreRefusal };
