import { z } from "zod";
import { MESSAGING_API } from "../messaging-config";

export const ZALO_EVENT_NAMES = [
	"user_send_text",
	"user_send_image",
	"user_send_file",
	"user_send_sticker",
	"follow",
	"unfollow",
	"user_received_message",
	"user_seen_message",
] as const;

export type ZaloEventName = (typeof ZALO_EVENT_NAMES)[number];

export function isZaloEventName(value: string): value is ZaloEventName {
	return (ZALO_EVENT_NAMES as readonly string[]).includes(value);
}

const externalId = z.union([z.string(), z.number()]).transform(String);

const stamp = z
	.union([z.string(), z.number()])
	.transform(String)
	.refine((value) => /^\d{10,16}$/.test(value), {
		message: "The timestamp is not epoch milliseconds.",
	});

const party = z.object({ id: externalId.pipe(z.string().min(1)) });

export const zaloEventEnvelope = z.object({
	event_name: z.string().min(1),
	timestamp: stamp,
	oa_id: externalId.optional(),
	sender: party.optional(),
	recipient: party.optional(),
});

export type ZaloEventEnvelope = z.infer<typeof zaloEventEnvelope>;

const attachment = z.object({
	type: z.string().optional(),
	payload: z
		.object({
			url: z.string().optional(),
			thumbnail: z.string().optional(),
			name: z.string().optional(),
			size: z.coerce.number().int().nonnegative().optional(),
		})
		.optional(),
});

function messageEvent<Name extends ZaloEventName>(name: Name) {
	return z.object({
		event_name: z.literal(name),
		timestamp: stamp,
		app_id: externalId.optional(),
		sender: party,
		recipient: party,
		message: z.object({
			msg_id: externalId.pipe(z.string().min(1)),
			text: z.string().optional(),
			attachments: z.array(attachment).optional(),
		}),
	});
}

function followEvent<Name extends ZaloEventName>(name: Name) {
	return z.object({
		event_name: z.literal(name),
		timestamp: stamp,
		oa_id: externalId.pipe(z.string().min(1)),
		follower: party,
	});
}

const receivedEvent = z.object({
	event_name: z.literal("user_received_message"),
	timestamp: stamp,
	app_id: externalId.optional(),
	sender: party.optional(),
	recipient: party.optional(),
	message: z.object({ msg_id: externalId.pipe(z.string().min(1)) }),
});

const seenEvent = z.object({
	event_name: z.literal("user_seen_message"),
	timestamp: stamp,
	app_id: externalId.optional(),
	sender: party.optional(),
	recipient: party.optional(),
	message: z.object({
		msg_ids: z
			.array(externalId.pipe(z.string().min(1)))
			.min(1)
			.max(MESSAGING_API.webhook.maxReceiptIds),
	}),
});

export const zaloWebhookEvent = z.discriminatedUnion("event_name", [
	messageEvent("user_send_text"),
	messageEvent("user_send_image"),
	messageEvent("user_send_file"),
	messageEvent("user_send_sticker"),
	followEvent("follow"),
	followEvent("unfollow"),
	receivedEvent,
	seenEvent,
]);

export type ZaloWebhookEvent = z.infer<typeof zaloWebhookEvent>;
export type ZaloMessageEvent = z.infer<ReturnType<typeof messageEvent>>;
export type ZaloAttachment = z.infer<typeof attachment>;
