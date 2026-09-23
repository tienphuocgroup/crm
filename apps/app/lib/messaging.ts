import type { MessageKind, MessageStatus } from "@crm/db/enums";
import { MESSAGING_POLICY } from "@crm/db/messaging";

const IDENTITY_SUFFIX_LENGTH = 4;

type Identity = { displayName: string | null; externalId: string };

type Contact = { firstName: string | null; lastName: string | null } | null;

export type PersonLabel =
	| { kind: "name"; name: string }
	| { kind: "key"; key: string; params: { suffix: string } };

export function attachmentUrl(url: string): string | null {
	let parsed: URL;

	try {
		parsed = new URL(url);
	} catch {
		return null;
	}

	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
	if (!isAttachmentHost(parsed.hostname)) return null;

	parsed.protocol = "https:";

	return parsed.toString();
}

export function avatarUrl(url: string | null | undefined): string | undefined {
	if (!url) return undefined;

	return attachmentUrl(url) ?? undefined;
}

export function isAttachmentHost(hostname: string): boolean {
	const host = hostname.toLowerCase();

	return MESSAGING_POLICY.zalo.attachmentHosts.some(
		(allowed) => host === allowed || host.endsWith(`.${allowed}`),
	);
}

export function contactName(contact: Contact): string | null {
	if (!contact) return null;

	const name = [contact.firstName, contact.lastName]
		.filter(Boolean)
		.join(" ")
		.trim();

	return name || null;
}

export function externalIdSuffix(externalId: string): string {
	const trimmed = externalId.trim();

	return trimmed.length <= IDENTITY_SUFFIX_LENGTH
		? trimmed
		: trimmed.slice(-IDENTITY_SUFFIX_LENGTH);
}

export function identityLabel(identity: Identity): PersonLabel {
	const display = identity.displayName?.trim();

	if (display) return { kind: "name", name: display };

	return {
		kind: "key",
		key: "messagingUnknownPersonWithId",
		params: { suffix: externalIdSuffix(identity.externalId) },
	};
}

export function blockedSendReason(error: {
	data?: { code?: string } | null;
	message: string;
}): string | null {
	return error.data?.code === "UNPROCESSABLE_CONTENT" ? error.message : null;
}

export type RequestIdLease = { take: () => string; settle: () => void };

export function requestIdLease(mint: () => string): RequestIdLease {
	let held: string | null = null;

	return {
		take: () => {
			held ??= mint();

			return held;
		},
		settle: () => {
			held = null;
		},
	};
}

export function mergeOptimistic<Row extends { id: string }>(
	rows: Row[],
	optimistic: Row[],
): Row[] {
	if (optimistic.length === 0) return rows;

	const known = new Set(rows.map((row) => row.id));

	return [...rows, ...optimistic.filter((row) => !known.has(row.id))];
}

export function selectThread<Row extends { id: string }>(
	rows: Row[],
	threadId: string | null,
	fallback: Row | null | undefined,
): Row | null {
	if (!threadId) return null;

	const listed = rows.find((row) => row.id === threadId);
	if (listed) return listed;

	return fallback && fallback.id === threadId ? fallback : null;
}

export function threadLabel(thread: {
	contact: Contact;
	identity: Identity;
}): PersonLabel {
	const linked = contactName(thread.contact);

	if (linked) return { kind: "name", name: linked };

	return identityLabel(thread.identity);
}

const MESSAGE_KIND_KEY: Record<MessageKind, string> = {
	TEXT: "",
	IMAGE: "messagingKindImage",
	FILE: "messagingKindFile",
	STICKER: "messagingKindSticker",
	OTHER: "messagingKindOther",
};

export function messageKindKey(kind: MessageKind): string {
	return MESSAGE_KIND_KEY[kind];
}

const MESSAGE_STATUS_KEY: Record<MessageStatus, string> = {
	QUEUED: "messagingStatusSending",
	SENDING: "messagingStatusSending",
	SENT: "messagingStatusSent",
	DELIVERED: "messagingStatusDelivered",
	READ: "messagingStatusRead",
	FAILED: "",
};

export function messageStatusKey(status: MessageStatus): string {
	return MESSAGE_STATUS_KEY[status];
}

export function hasPendingSend(rows: { status: MessageStatus }[]): boolean {
	return rows.some(
		(row) => row.status === "QUEUED" || row.status === "SENDING",
	);
}

export function nameParts(displayName: string): {
	firstName: string;
	lastName: string;
} {
	const name = displayName.trim().replace(/\s+/g, " ");
	const split = name.lastIndexOf(" ");

	if (split === -1) return { firstName: name, lastName: "" };

	return { firstName: name.slice(0, split), lastName: name.slice(split + 1) };
}
