"use client";

import Document from "@carbon/icons-react/es/Document";
import {
	Attachment,
	AttachmentContent,
	AttachmentMedia,
	AttachmentTitle,
	AttachmentTrigger,
} from "@crm/ui/components/attachment";
import { Bubble, BubbleContent } from "@crm/ui/components/bubble";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import { Spinner } from "@crm/ui/components/spinner";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { LocalDateTime } from "@/components/local-date-time";
import {
	attachmentUrl,
	messageKindKey,
	messageStatusKey,
} from "@/lib/messaging";
import type { RouterOutputs } from "@/lib/trpc/types";

export type MessagingMessage =
	RouterOutputs["messaging"]["messages"]["rows"][number];

type MessagingAttachment = { url: string; name?: string; size?: number };

type ResolvedAttachment = { url: string; name?: string };

function resolveAttachments(
	attachments: MessagingAttachment[],
): ResolvedAttachment[] {
	return attachments.flatMap((attachment) => {
		const url = attachmentUrl(attachment.url);

		return url ? [{ url, name: attachment.name }] : [];
	});
}

const TIME_OPTIONS: Intl.DateTimeFormatOptions = {
	hour: "numeric",
	minute: "2-digit",
};

export function MessageBubble({
	message,
	onRetry,
	retrying = false,
}: {
	message: MessagingMessage;
	onRetry?: (body: string) => void;
	retrying?: boolean;
}) {
	const t = useTranslations("contacts");
	const outbound = message.direction === "OUTBOUND";
	const body = message.body?.trim();
	const kindKey = messageKindKey(message.kind);
	const attachments = resolveAttachments(message.attachments);
	const statusKey = outbound ? messageStatusKey(message.status) : "";
	const failed = outbound && message.status === "FAILED";
	const canRetry = failed && Boolean(body) && Boolean(onRetry);

	return (
		<Bubble
			align={outbound ? "end" : "start"}
			variant={outbound ? "default" : "muted"}
		>
			{body ? <BubbleContent>{body}</BubbleContent> : null}

			{attachments.map((attachment) => (
				<MessageAttachment
					attachment={attachment}
					key={attachment.url}
					kind={message.kind}
				/>
			))}

			<span className="flex min-w-0 flex-wrap items-center gap-x-2 text-muted-foreground text-xs">
				<span className="tabular-nums">
					<LocalDateTime
						date={message.sentAt ?? message.queuedAt}
						options={TIME_OPTIONS}
					/>
				</span>
				{statusKey ? <span>{t(statusKey)}</span> : null}
				{outbound && message.sentBy ? (
					<span className="min-w-0 truncate">{message.sentBy.name}</span>
				) : null}
			</span>

			{outbound && message.errorMessage ? (
				<span className="text-destructive text-xs">{message.errorMessage}</span>
			) : null}

			{canRetry && body ? (
				<Button
					disabled={retrying}
					onClick={() => onRetry?.(body)}
					size="sm"
					variant="outline"
				>
					{retrying ? <Spinner /> : null}
					{t("messagingRetryAction")}
				</Button>
			) : null}

			{!body && attachments.length === 0 && kindKey ? (
				<BubbleContent>{t(kindKey)}</BubbleContent>
			) : null}
		</Bubble>
	);
}

function MessageAttachment({
	attachment,
	kind,
}: {
	attachment: ResolvedAttachment;
	kind: MessagingMessage["kind"];
}) {
	const t = useTranslations("contacts");
	const [broken, setBroken] = useState(false);
	const url = attachment.url;

	if (kind === "IMAGE" && broken) {
		return (
			<span className="text-muted-foreground text-xs">
				{t("messagingImageGone")}
			</span>
		);
	}

	if (kind === "IMAGE") {
		return (
			<BubbleContent asChild>
				<a href={url} rel="noopener noreferrer" target="_blank">
					<img
						alt={t("messagingImageAlt")}
						className="max-h-60 w-auto rounded-md"
						onError={() => setBroken(true)}
						src={url}
					/>
				</a>
			</BubbleContent>
		);
	}

	return (
		<Attachment size="sm">
			<AttachmentMedia>
				<Icon icon={Document} />
			</AttachmentMedia>
			<AttachmentContent>
				<AttachmentTitle>
					{attachment.name ?? t("messagingAttachmentFallbackTitle")}
				</AttachmentTitle>
			</AttachmentContent>
			<AttachmentTrigger asChild>
				<a href={url} rel="noopener noreferrer" target="_blank">
					<span className="sr-only">{t("messagingOpenAttachmentAction")}</span>
				</a>
			</AttachmentTrigger>
		</Attachment>
	);
}
