import "@crm/env/load";

import { db, type MessageStatus } from "@crm/db";
import type { ZaloCredentials } from "./zalo-client";

export type ZaloAccount = {
	id: string;
	externalId: string;
	refreshToken: string | null;
	tokenExpiresAt: Date | null;
	tokenError: string | null;
	disconnectedAt: Date | null;
};

function trimmed(key: string): string | null {
	const value = process.env[key]?.trim();
	return value ? value : null;
}

export function zaloCredentials(): ZaloCredentials | null {
	const appId = trimmed("ZALO_APP_ID");
	const appSecret = trimmed("ZALO_APP_SECRET");
	if (!appId || !appSecret) return null;

	return { appId, appSecret };
}

export function isZaloConfigured(): boolean {
	return zaloCredentials() !== null;
}

export async function readZaloAccount(
	accountId: string,
): Promise<ZaloAccount | null> {
	return db.messagingAccount.findUnique({
		where: { id: accountId },
		select: {
			id: true,
			externalId: true,
			refreshToken: true,
			tokenExpiresAt: true,
			tokenError: true,
			disconnectedAt: true,
		},
	});
}

export async function writeRefreshedTokens(input: {
	accountId: string;
	accessToken: string;
	refreshToken: string;
	expiresInSeconds: number;
	now: Date;
}): Promise<boolean> {
	const { count } = await db.messagingAccount.updateMany({
		where: { id: input.accountId, disconnectedAt: null },
		data: {
			accessToken: input.accessToken,
			refreshToken: input.refreshToken,
			tokenExpiresAt: new Date(
				input.now.getTime() + input.expiresInSeconds * 1000,
			),
			tokenRefreshedAt: input.now,
			tokenError: null,
		},
	});

	return count > 0;
}

export async function writeTokenError(input: {
	accountId: string;
	sentence: string;
}): Promise<boolean> {
	const { count } = await db.messagingAccount.updateMany({
		where: { id: input.accountId, disconnectedAt: null },
		data: { tokenError: input.sentence },
	});

	return count > 0;
}

export type ZaloSendContext = {
	message: {
		id: string;
		threadId: string;
		body: string | null;
		status: MessageStatus;
	};
	thread: { id: string; lastInboundAt: Date | null };
	identity: { id: string; externalId: string };
	account: {
		id: string;
		accessToken: string | null;
		tokenRefreshedAt: Date | null;
		tokenError: string | null;
		disconnectedAt: Date | null;
	};
};

export type ZaloIdentityContext = {
	identity: { id: string; externalId: string };
	account: {
		id: string;
		accessToken: string | null;
		tokenError: string | null;
		disconnectedAt: Date | null;
	};
};

const SEND_ACCOUNT_SELECT = {
	id: true,
	accessToken: true,
	tokenRefreshedAt: true,
	tokenError: true,
	disconnectedAt: true,
} as const;

export async function readZaloSendContext(
	messageId: string,
): Promise<ZaloSendContext | null> {
	const message = await db.message.findUnique({
		where: { id: messageId },
		select: {
			id: true,
			threadId: true,
			body: true,
			status: true,
			thread: {
				select: {
					id: true,
					lastInboundAt: true,
					identity: { select: { id: true, externalId: true } },
					account: { select: SEND_ACCOUNT_SELECT },
				},
			},
		},
	});

	if (!message) return null;

	return {
		message: {
			id: message.id,
			threadId: message.threadId,
			body: message.body,
			status: message.status,
		},
		thread: {
			id: message.thread.id,
			lastInboundAt: message.thread.lastInboundAt,
		},
		identity: message.thread.identity,
		account: message.thread.account,
	};
}

export async function readZaloAccountToken(accountId: string): Promise<{
	accessToken: string | null;
	tokenRefreshedAt: Date | null;
} | null> {
	return db.messagingAccount.findUnique({
		where: { id: accountId },
		select: { accessToken: true, tokenRefreshedAt: true },
	});
}

export async function readZaloIdentityContext(
	identityId: string,
): Promise<ZaloIdentityContext | null> {
	const identity = await db.contactChannelIdentity.findUnique({
		where: { id: identityId },
		select: {
			id: true,
			externalId: true,
			account: {
				select: {
					id: true,
					accessToken: true,
					tokenError: true,
					disconnectedAt: true,
				},
			},
		},
	});

	if (!identity) return null;

	return {
		identity: { id: identity.id, externalId: identity.externalId },
		account: identity.account,
	};
}
