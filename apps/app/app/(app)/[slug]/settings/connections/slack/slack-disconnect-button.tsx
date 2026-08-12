"use client";

import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@crm/ui/components/alert-dialog";
import {
	AsyncButtonContent,
	useAsyncAction,
} from "@crm/ui/components/async-action";
import { Button } from "@crm/ui/components/button";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

export function SlackDisconnectButton({
	canManage,
	workspace,
}: {
	canManage: boolean;
	workspace: string | null;
}) {
	const t = useTranslations("settings");
	const common = useTranslations("common");
	const trpc = useTRPC();
	const cache = useCrmCache();
	const router = useRouter();
	const [confirming, setConfirming] = useState(false);
	const disconnect = useMutation(
		trpc.slack.disconnect.mutationOptions({
			onSuccess: async () => {
				await cache.slack();
				setConfirming(false);
				toast.success(t("connections.slackDisconnectedToast"));
				router.refresh();
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const disconnectAction = useAsyncAction({
		action: () => disconnect.mutateAsync(),
	});

	return (
		<>
			<Button
				variant="outline"
				size="sm"
				onClick={() => setConfirming(true)}
				disabled={!canManage || disconnectAction.pending}
			>
				{t("connections.slackDisconnectButton")}
			</Button>

			<AlertDialog
				open={confirming}
				onOpenChange={(open) => {
					if (!disconnectAction.pending) setConfirming(open);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{t("connections.slackDisconnectConfirmTitle", {
								workspace: workspace ?? "Slack",
							})}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{t("connections.slackDisconnectConfirmDescription")}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={disconnectAction.pending}>
							{common("cancel")}
						</AlertDialogCancel>
						<Button
							variant="destructive"
							disabled={disconnectAction.pending}
							onClick={() => void disconnectAction.run()}
						>
							<AsyncButtonContent
								status={disconnectAction.status}
								pendingLabel={t("connections.slackDisconnectingLabel")}
							>
								{t("connections.slackDisconnectButton")}
							</AsyncButtonContent>
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
