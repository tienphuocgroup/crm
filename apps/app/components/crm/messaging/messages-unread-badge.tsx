"use client";

import { Badge } from "@crm/ui/components/badge";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { MESSAGING_UI } from "./messaging-ui-config";

export function MessagesUnreadBadge() {
	const trpc = useTRPC();

	const zalo = useQuery({
		...trpc.zalo.status.queryOptions(),
		staleTime: MESSAGING_UI.connectionStaleMs,
	});

	const connected = zalo.data?.connected === true;

	const unread = useQuery({
		...trpc.messaging.unreadCount.queryOptions(),
		enabled: connected,
		refetchInterval: MESSAGING_UI.unreadPollMs,
	});

	const count = connected ? (unread.data?.count ?? 0) : 0;

	if (count === 0) return null;

	return <Badge>{count}</Badge>;
}
