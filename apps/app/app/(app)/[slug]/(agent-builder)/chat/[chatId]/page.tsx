import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { AgentBuilderChat } from "@/components/agent-builder/agent-builder-chat";
import { AgentBuilderChatFallback } from "@/components/agent-builder/agent-builder-route-fallback";
import { isSharedChatToken } from "@/lib/chat-route";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("agent-panel");
	return { title: t("chatTitleFallback") };
}

export default function AgentChatPage({
	params,
}: {
	params: Promise<{ chatId: string }>;
}) {
	return (
		<Suspense fallback={<AgentBuilderChatFallback />}>
			<PrefetchedAgentChat params={params} />
		</Suspense>
	);
}

async function PrefetchedAgentChat({
	params,
}: {
	params: Promise<{ chatId: string }>;
}) {
	const { chatId } = await params;
	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();
	const sharedChat = isSharedChatToken(chatId);

	const initialData = sharedChat
		? await queryClient
				.fetchQuery(trpc.conversations.shared.queryOptions({ token: chatId }))
				.catch(() => null)
		: await queryClient.fetchQuery(
				trpc.conversations.builderById.queryOptions({
					id: chatId,
				}),
			);

	return <AgentBuilderChat conversationId={chatId} initialData={initialData} />;
}
