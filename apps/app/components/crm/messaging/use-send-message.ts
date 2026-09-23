"use client";

import { useMutation } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { blockedSendReason, requestIdLease } from "@/lib/messaging";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import type { MessagingMessage } from "./message-bubble";

type Queued = RouterOutputs["messaging"]["send"];

export type SendMessage = {
	send: (body: string, onSent?: () => void) => void;
	pending: boolean;
	blocked: string | null;
	optimistic: MessagingMessage[];
	isOwn: (messageId: string) => boolean;
};

export function useSendMessage(threadId: string): SendMessage {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const [optimistic, setOptimistic] = useState<MessagingMessage[]>([]);
	const [blocked, setBlocked] = useState<string | null>(null);
	const ownIds = useRef(new Set<string>());
	const lease = useRef(requestIdLease(() => crypto.randomUUID()));

	const mutation = useMutation(
		trpc.messaging.send.mutationOptions({
			onSuccess: async (queued, input) => {
				ownIds.current.add(queued.messageId);
				setBlocked(null);
				setOptimistic((rows) => [...rows, queuedMessage(queued, input.body)]);
				await cache.messagingSent();
			},
			onError: async (error) => {
				const reason = blockedSendReason(error);

				if (!reason) {
					toast.error(error.message);
					return;
				}

				setBlocked(reason);
				await cache.messagingSent();
			},
			onSettled: () => lease.current.settle(),
		}),
	);

	const mutate = mutation.mutate;

	const send = useCallback(
		(body: string, onSent?: () => void) =>
			mutate(
				{ threadId, body, clientRequestId: lease.current.take() },
				{ onSuccess: () => onSent?.() },
			),
		[mutate, threadId],
	);

	const isOwn = useCallback(
		(messageId: string) => ownIds.current.has(messageId),
		[],
	);

	return { send, pending: mutation.isPending, blocked, optimistic, isOwn };
}

function queuedMessage(queued: Queued, body: string): MessagingMessage {
	return {
		id: queued.messageId,
		direction: "OUTBOUND",
		status: queued.status,
		kind: "TEXT",
		body,
		attachments: [],
		queuedAt: new Date().toISOString(),
		sentAt: null,
		deliveredAt: null,
		readAt: null,
		failedAt: null,
		errorMessage: null,
		sentBy: null,
	};
}
