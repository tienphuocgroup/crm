const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;

const DEFAULT_API_URL = "http://localhost:3001";
const DEFAULT_APP_URL = "http://localhost:3000";

export const MESSAGING_API = {
	oauth: {
		verifierTtlMs: 10 * MINUTE_MS,
		verifierLength: 43,
		verifierAlphabet:
			"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
		identifier: "zalo-pkce",
		pendingScanLimit: 20,
		requestTimeoutMs: 10 * SECOND_MS,
		connectPath: "/api/messaging/zalo/connect",
		callbackPath: "/api/messaging/zalo/callback",
		fallbackReturnTo: "/settings/connections/zalo",
		provider: "zalo",
	},
	tasks: {
		tokenRefreshKind: "message-token-refresh",
		sendKind: "message-send",
		disconnectedOutcome: "Disconnected",
		replacedOutcome: "Replaced by another OA",
	},
	threads: { pageSize: 30, maxPageSize: 100 },
	messages: { pageSize: 50 },
	webhook: {
		maxBodyBytes: 64 * 1024,
		clockSkewMs: 2 * HOUR_MS,
		path: "/api/messaging/zalo/webhook",
		maxAttachments: 10,
		maxAttachmentUrlLength: 2000,
		maxReceiptIds: 50,
		signatureHeader: "x-zevent-signature",
		contentType: "application/json",
	},
	subjects: {
		IMAGE: "Image",
		FILE: "File",
		STICKER: "Sticker",
		OTHER: "Message",
	},
	zalo: {
		authorizeUrl: "https://oauth.zaloapp.com/v4/oa/permission",
		tokenUrl: "https://oauth.zaloapp.com/v4/oa/access_token",
		profileUrl: "https://openapi.zalo.me/v2.0/oa/getoa",
		refreshEveryMs: 6 * HOUR_MS,
	},
} as const;

export type ZaloCredentials = { appId: string; appSecret: string };

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

export function zaloWebhookSecret(): string | null {
	return trimmed("ZALO_OA_SECRET_KEY") ?? trimmed("ZALO_APP_SECRET");
}

export function isZaloConfigured(): boolean {
	return zaloCredentials() !== null;
}

export function isZaloHalfConfigured(): boolean {
	const appId = trimmed("ZALO_APP_ID");
	const appSecret = trimmed("ZALO_APP_SECRET");

	return Boolean(appId) !== Boolean(appSecret);
}

export function apiBaseUrl(): string {
	const base =
		trimmed("API_URL") ?? trimmed("BETTER_AUTH_URL") ?? DEFAULT_API_URL;

	return base.replace(/\/+$/, "");
}

export function appBaseUrl(): string {
	const first = (trimmed("APP_URL") ?? DEFAULT_APP_URL)
		.split(",")
		.map((origin) => origin.trim())
		.filter(Boolean)[0];

	return (first ?? DEFAULT_APP_URL).replace(/\/+$/, "");
}

export function zaloRedirectUri(): string {
	return `${apiBaseUrl()}${MESSAGING_API.oauth.callbackPath}`;
}

export function isSafeReturnTo(value: string): boolean {
	return (
		value.startsWith("/") &&
		!value.startsWith("//") &&
		!value.startsWith("/\\") &&
		!value.includes("\n") &&
		!value.includes("\r")
	);
}
