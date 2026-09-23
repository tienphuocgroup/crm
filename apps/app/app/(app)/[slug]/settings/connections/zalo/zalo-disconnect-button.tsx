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

export function ZaloDisconnectButton({
	canManage,
	oaName,
}: {
	canManage: boolean;
	oaName: string | null;
}) {
	const t = useTranslations("settings");
	const common = useTranslations("common");
	const trpc = useTRPC();
	const cache = useCrmCache();
	const router = useRouter();
	const [confirming, setConfirming] = useState(false);
	const disconnect = useMutation(
		trpc.zalo.disconnect.mutationOptions({
			onSuccess: async () => {
				await cache.zalo();
				setConfirming(false);
				toast.success(t("connections.zaloDisconnectedToast"));
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
				disabled={!canManage || disconnectAction.pending}
				onClick={() => setConfirming(true)}
				size="sm"
				variant="outline"
			>
				{t("connections.disconnect")}
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
							{t("connections.zaloDisconnectConfirmTitle", {
								oaName: oaName ?? "Zalo Official Account",
							})}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{t("connections.zaloDisconnectConfirmDescription")}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={disconnectAction.pending}>
							{common("cancel")}
						</AlertDialogCancel>
						<Button
							disabled={disconnectAction.pending}
							onClick={() => void disconnectAction.run()}
							variant="destructive"
						>
							<AsyncButtonContent
								pendingLabel={t("connections.zaloDisconnectingLabel")}
								status={disconnectAction.status}
							>
								{t("connections.disconnect")}
							</AsyncButtonContent>
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
