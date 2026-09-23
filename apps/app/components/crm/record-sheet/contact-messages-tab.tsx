"use client";

import Chat from "@carbon/icons-react/es/Chat";
import { Spinner } from "@crm/ui/components/spinner";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { MESSAGING_UI } from "@/components/crm/messaging/messaging-ui-config";
import { ThreadView } from "@/components/crm/messaging/thread-view";
import { DetailSheetEmpty } from "@/components/detail-sheet";
import { useTRPC } from "@/lib/trpc/client";

export function ContactMessagesTab({ contactId }: { contactId: string }) {
	const t = useTranslations("contacts");
	const trpc = useTRPC();

	const zalo = useQuery({
		...trpc.zalo.status.queryOptions(),
		staleTime: MESSAGING_UI.connectionStaleMs,
	});

	const oaReady =
		zalo.data?.configured === true && zalo.data.connected === true;

	const query = useQuery({
		...trpc.messaging.threadByContact.queryOptions({ contactId }),
		enabled: oaReady,
		refetchInterval: (current) =>
			current.state.status === "error" ? false : MESSAGING_UI.inboxPollMs,
	});

	if (zalo.isPending || (oaReady && query.isPending)) {
		return (
			<div className="flex min-h-0 flex-1 items-center justify-center">
				<Spinner />
			</div>
		);
	}

	const thread = query.data?.thread ?? null;

	if (!thread) {
		return (
			<DetailSheetEmpty
				description={t("messagingNoThreadDescription")}
				icon={Chat}
				title={t("messagingNoThreadTitle")}
			/>
		);
	}

	return (
		<ThreadView
			canManage={zalo.data?.canManage === true}
			onDeleted={() => void query.refetch()}
			pending={false}
			thread={thread}
		/>
	);
}
