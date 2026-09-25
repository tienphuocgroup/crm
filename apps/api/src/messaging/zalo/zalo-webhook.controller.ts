import { MessageKind, MessagingChannel } from "@crm/db";
import { messagingError } from "@crm/telemetry";
import { schemas } from "@crm/validation";
import { Controller, Logger, Post, Req, Res } from "@nestjs/common";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import type { Request, Response } from "express";
import type { z } from "zod";
import {
	type AttachmentCandidate,
	acceptAttachments,
	type IncomingChannelMessage,
	type StoreResult,
} from "../incoming-message";
import {
	MESSAGING_API,
	zaloCredentials,
	zaloWebhookSecret,
} from "../messaging-config";
import {
	MessagingWriterService,
	type WriterAccount,
} from "../messaging-writer.service";
import { rawBody } from "./zalo-raw-body";
import { verifyZaloSignature } from "./zalo-signature";
import {
	isZaloEventName,
	type ZaloEventEnvelope,
	type ZaloMessageEvent,
	type ZaloWebhookEvent,
	zaloEventEnvelope,
	zaloWebhookEvent,
} from "./zalo-webhook.schema";

type ZaloJson = z.infer<typeof schemas.messaging.zaloJson>;

const KINDS = {
	user_send_text: MessageKind.TEXT,
	user_send_image: MessageKind.IMAGE,
	user_send_file: MessageKind.FILE,
	user_send_sticker: MessageKind.STICKER,
} satisfies Record<string, MessageKind>;

function isMessageKindEvent(name: string): name is keyof typeof KINDS {
	return Object.hasOwn(KINDS, name);
}

@Controller("api/messaging/zalo")
export class ZaloWebhookController {
	private readonly logger = new Logger(ZaloWebhookController.name);

	constructor(private readonly writer: MessagingWriterService) {}

	@Post("webhook")
	@AllowAnonymous()
	async receive(
		@Req() request: Request,
		@Res() response: Response,
	): Promise<void> {
		try {
			await this.handle(request, response);
		} catch (error) {
			this.logger.error({
				message: "The Zalo webhook could not store an event.",
				error: errorName(error),
			});
			messagingError({ error, stage: "webhook" });
			answer(response, 500);
		}
	}

	private async handle(request: Request, response: Response): Promise<void> {
		if (!isJsonRequest(request.headers["content-type"])) {
			this.logger.warn({ message: "Webhook refused: content type" });
			answer(response, 401);
			return;
		}

		const read = await rawBody(request, MESSAGING_API.webhook.maxBodyBytes);

		if (!read.ok) {
			answer(response, read.reason === "too-large" ? 413 : 400);
			return;
		}

		const payload = jsonOf(read.body);
		const envelope = payload === null ? null : envelopeOf(payload);

		if (!envelope || !this.verified(request, read.body, envelope)) {
			this.logHeaderNames(request);
			answer(response, 401);
			return;
		}

		const now = Date.now();
		if (
			Math.abs(now - Number(envelope.timestamp)) >
			MESSAGING_API.webhook.clockSkewMs
		) {
			answer(response, 401);
			return;
		}

		const account = await this.writer.accountFor(
			MessagingChannel.ZALO,
			candidateAccountIds(envelope),
		);

		if (account) await this.writer.touchWebhook(account.id, new Date(now));

		if (!isZaloEventName(envelope.event_name)) {
			this.logger.debug({
				message: "The Zalo webhook skipped an event it does not know.",
				event: envelope.event_name,
			});
			answer(response, 200);
			return;
		}

		const parsed = zaloWebhookEvent.safeParse(payload);

		if (!parsed.success) {
			this.logger.warn({
				message: "The Zalo webhook could not read a known event.",
				event: envelope.event_name,
				error: parsed.error.name,
			});
			answer(response, 200);
			return;
		}

		if (!account || account.disconnectedAt !== null) {
			this.logger.warn({
				message: "The Zalo webhook has no connected Official Account.",
				event: envelope.event_name,
			});
			answer(response, 200);
			return;
		}

		const result = await this.dispatch(parsed.data, account);

		if (result && !result.stored && result.reason !== "duplicate") {
			this.logger.warn({
				message: "The Zalo webhook could not store an event.",
				reason: result.reason,
			});
			messagingError({ error: result.reason, stage: "webhook" });
			answer(response, 500);
			return;
		}

		answer(response, 200);
	}

	private async dispatch(
		event: ZaloWebhookEvent,
		account: WriterAccount,
	): Promise<StoreResult | null> {
		const at = new Date(Number(event.timestamp));

		if (event.event_name === "follow" || event.event_name === "unfollow") {
			const identity = {
				channel: MessagingChannel.ZALO,
				accountExternalId: event.oa_id,
				senderExternalId: event.follower.id,
				kind: event.event_name,
				at,
			} as const;

			if (event.event_name === "follow") await this.writer.follow(identity);
			else await this.writer.unfollow(identity);

			return null;
		}

		if (event.event_name === "user_received_message") {
			await this.writer.receipts(
				account.id,
				[event.message.msg_id],
				"delivered",
				at,
			);

			return null;
		}

		if (event.event_name === "user_seen_message") {
			await this.writer.receipts(account.id, event.message.msg_ids, "seen", at);

			return null;
		}

		return this.writer.store(this.incomingOf(event, at, account));
	}

	private incomingOf(
		event: ZaloMessageEvent,
		at: Date,
		account: WriterAccount,
	): IncomingChannelMessage {
		const intake = acceptAttachments(
			(event.message.attachments ?? []).flatMap((item) => {
				const payload = item.payload;
				if (!payload?.url) return [];

				const candidate: AttachmentCandidate = { url: payload.url };
				if (payload.name) candidate.name = payload.name;
				if (payload.size !== undefined) candidate.size = payload.size;

				return [candidate];
			}),
		);

		if (intake.droppedHosts.length > 0) {
			this.logger.warn({
				message:
					"The Zalo webhook dropped an attachment from a host it does not trust.",
				hosts: [...new Set(intake.droppedHosts)].join(", "),
			});
		}

		const text = event.message.text?.trim() ?? "";

		return {
			channel: MessagingChannel.ZALO,
			accountExternalIds: candidateAccountIds(event),
			senderExternalId:
				event.sender.id === account.externalId
					? event.recipient.id
					: event.sender.id,
			displayName: null,
			avatarUrl: null,
			kind: isMessageKindEvent(event.event_name)
				? KINDS[event.event_name]
				: MessageKind.OTHER,
			body: text.length > 0 ? text : null,
			attachments: intake.attachments,
			externalId: event.message.msg_id,
			sentAt: at,
		};
	}

	private verified(
		request: Request,
		body: string,
		envelope: ZaloEventEnvelope,
	): boolean {
		const credentials = zaloCredentials();
		const secret = zaloWebhookSecret();

		if (!credentials || !secret) return false;

		const header = request.headers[MESSAGING_API.webhook.signatureHeader];

		return verifyZaloSignature({
			appId: credentials.appId,
			rawBody: body,
			timestamp: envelope.timestamp,
			secret,
			header: Array.isArray(header) ? (header[0] ?? null) : (header ?? null),
		});
	}

	private logHeaderNames(request: Request): void {
		if (process.env.NODE_ENV === "production") return;

		this.logger.debug({
			message: "A Zalo webhook failed the signature check.",
			headers: Object.keys(request.headers).join(", "),
		});
	}
}

function answer(response: Response, status: number): void {
	if (response.headersSent) return;
	response.status(status).end();
}

function jsonOf(body: string): ZaloJson | null {
	try {
		return schemas.messaging.zaloJson.parse(JSON.parse(body));
	} catch {
		return null;
	}
}

function envelopeOf(payload: ZaloJson): ZaloEventEnvelope | null {
	const parsed = zaloEventEnvelope.safeParse(payload);

	return parsed.success ? parsed.data : null;
}

function candidateAccountIds(envelope: ZaloEventEnvelope): string[] {
	return [envelope.oa_id, envelope.recipient?.id, envelope.sender?.id].filter(
		(value): value is string => value !== undefined && value.length > 0,
	);
}

function isJsonRequest(header: string | undefined): boolean {
	const type = header?.split(";")[0]?.trim().toLowerCase();

	return type === MESSAGING_API.webhook.contentType;
}

function errorName(cause: unknown): string {
	return cause instanceof Error ? cause.name : "NonError";
}
