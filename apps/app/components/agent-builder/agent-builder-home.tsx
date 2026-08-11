"use client";

import ArrowRight from "@carbon/icons-react/es/ArrowRight";
import { Icon } from "@crm/ui/components/icon";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";
import { AgentComposer, type BuilderComposerPrompt } from "./agent-composer";

const SUGGESTION_KEYS = [
	"suggestionBriefDealOwners",
	"suggestionFlagInactiveDeals",
	"suggestionHandNewCustomers",
] as const;

export function AgentBuilderHome({ name }: { name: string }) {
	const t = useTranslations("agent-panel");
	const router = useRouter();
	const workspaceUrl = useWorkspaceUrl();
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [initialPrompt, setInitialPrompt] = useState("");
	const create = useMutation(
		trpc.conversations.createBuilder.mutationOptions({
			onSuccess: async ({ id }) => {
				await queryClient.invalidateQueries({
					queryKey: trpc.conversations.builderList.pathKey(),
				});
				router.push(workspaceUrl(`/chat/${id}`));
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const submit = async (
		prompt: BuilderComposerPrompt,
		clientRequestId: string,
	) => {
		await create.mutateAsync({
			...prompt,
			clientRequestId,
		});
	};

	return (
		<main className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-4 pt-14 pb-20 sm:px-6 sm:pt-12 sm:pb-28">
			<div className="flex w-full max-w-3xl flex-col items-center gap-3 pb-6 text-center">
				<h1 className="text-balance font-medium text-2xl tracking-tight sm:text-3xl">
					{t("homeGreeting", { name: firstName(name) })}
				</h1>
				<p className="max-w-xl text-balance text-muted-foreground text-sm">
					{t("homeSubtitle")}
				</p>
			</div>

			<div className="w-full max-w-3xl">
				<AgentComposer
					key={initialPrompt}
					mode="home"
					initialPrompt={initialPrompt}
					onSubmit={submit}
				/>
				<p className="flex h-8 items-center px-px text-muted-foreground text-xs">
					{t("homePrivacyNotice")}
				</p>

				<div className="pt-1">
					<p className="flex h-7 items-center text-muted-foreground text-xs">
						{t("suggestedAgentsHeading")}
					</p>
					{SUGGESTION_KEYS.map((key) => {
						const suggestion = t(key);
						return (
							<button
								key={key}
								type="button"
								onClick={() => setInitialPrompt(`/Create agent ${suggestion}`)}
								className="flex h-[42px] w-full items-center border-t text-left outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50"
							>
								<span className="min-w-0 flex-1 font-medium text-sm">
									{suggestion}
								</span>
								<Icon
									icon={ArrowRight}
									className="size-4 text-muted-foreground"
								/>
							</button>
						);
					})}
				</div>
			</div>
		</main>
	);
}

function firstName(name: string): string {
	return name.trim().split(/\s+/)[0] || "there";
}
