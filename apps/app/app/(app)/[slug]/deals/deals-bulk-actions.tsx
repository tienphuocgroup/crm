"use client";

import TrashCan from "@carbon/icons-react/es/TrashCan";
import type { DealStage } from "@crm/db/enums";
import { Button } from "@crm/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@crm/ui/components/dialog";
import {
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
} from "@crm/ui/components/dropdown-menu";
import { Field, FieldLabel } from "@crm/ui/components/field";
import { Spinner } from "@crm/ui/components/spinner";
import { Textarea } from "@crm/ui/components/textarea";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { toast } from "sonner";
import {
	BulkActionsMenu,
	BulkDeleteDialog,
	BulkOwnerMenu,
	reportBulk,
} from "@/components/crm/bulk-actions";
import { DEAL_STAGE_OPTIONS, LOSING_STAGES } from "@/lib/deal-stage";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

export function DealsBulkActions({
	ids,
	onDone,
}: {
	ids: string[];
	onDone: () => void;
}) {
	const t = useTranslations("deals");
	const common = useTranslations("common");
	const trpc = useTRPC();
	const cache = useCrmCache();
	const users = useQuery(trpc.users.list.queryOptions());
	const reasonId = useId();
	const [confirming, setConfirming] = useState(false);
	const [closing, setClosing] = useState<DealStage | null>(null);
	const [reason, setReason] = useState("");

	const onError = (error: { message: string }) => toast.error(error.message);

	const assignOwner = useMutation(
		trpc.deals.bulkAssignOwner.mutationOptions({
			onSuccess: async (result) => {
				await cache.deal();
				reportBulk(common, result, (count) =>
					t("bulkReassignedToast", { count }),
				);
				onDone();
			},
			onError,
		}),
	);

	const setStage = useMutation(
		trpc.deals.bulkSetStage.mutationOptions({
			onSuccess: async (result) => {
				await cache.deal();
				reportBulk(common, result, (count) =>
					t("bulkStageMovedToast", { count }),
				);
				setClosing(null);
				setReason("");
				onDone();
			},
			onError,
		}),
	);

	const remove = useMutation(
		trpc.deals.bulkDelete.mutationOptions({
			onSuccess: async (result, variables) => {
				await cache.removedMany({ kind: "deal", ids: variables.ids });
				reportBulk(common, result, (count) => t("bulkDeletedToast", { count }));
				setConfirming(false);
				onDone();
			},
			onError,
		}),
	);

	const pending =
		assignOwner.isPending || setStage.isPending || remove.isPending;

	return (
		<>
			<BulkActionsMenu pending={pending}>
				<BulkOwnerMenu
					users={users.data ?? []}
					onSelect={(ownerId) =>
						ownerId && assignOwner.mutate({ ids, ownerId })
					}
				/>
				<DropdownMenuSub>
					<DropdownMenuSubTrigger>
						{t("bulkChangeStageLabel")}
					</DropdownMenuSubTrigger>
					<DropdownMenuSubContent className="max-h-72 overflow-y-auto">
						<DropdownMenuGroup>
							{DEAL_STAGE_OPTIONS.map((option) => (
								<DropdownMenuItem
									key={option.value}
									onSelect={() => {
										if (LOSING_STAGES.includes(option.value)) {
											setClosing(option.value);
											return;
										}
										setStage.mutate({ ids, stage: option.value });
									}}
								>
									{t(option.labelKey)}
								</DropdownMenuItem>
							))}
						</DropdownMenuGroup>
					</DropdownMenuSubContent>
				</DropdownMenuSub>
				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DropdownMenuItem
						variant="destructive"
						onSelect={() => setConfirming(true)}
					>
						<TrashCan />
						{common("delete")}
					</DropdownMenuItem>
				</DropdownMenuGroup>
			</BulkActionsMenu>

			<Dialog
				open={closing !== null}
				onOpenChange={(next) => {
					if (next) return;
					setClosing(null);
					setReason("");
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							{closing === "CLOSED_LOST"
								? t("bulkCloseLostTitle", { count: ids.length })
								: t("bulkMarkUnqualifiedTitle", { count: ids.length })}
						</DialogTitle>
						<DialogDescription>
							{t("bulkCloseReasonDescription")}
						</DialogDescription>
					</DialogHeader>

					<form
						id="bulk-close-reason"
						className="px-4"
						onSubmit={(event) => {
							event.preventDefault();
							if (!closing) return;
							setStage.mutate({ ids, stage: closing, closedReason: reason });
						}}
					>
						<Field>
							<FieldLabel htmlFor={reasonId}>{t("reasonLabel")}</FieldLabel>
							<Textarea
								id={reasonId}
								value={reason}
								onChange={(event) => setReason(event.target.value)}
								placeholder={t("bulkCloseReasonPlaceholder")}
								rows={3}
							/>
						</Field>
					</form>

					<DialogFooter>
						<Button
							type="submit"
							form="bulk-close-reason"
							disabled={setStage.isPending || reason.trim() === ""}
						>
							{setStage.isPending ? <Spinner /> : null}
							{common("save")}
						</Button>
						<Button
							variant="outline"
							onClick={() => {
								setClosing(null);
								setReason("");
							}}
						>
							{common("cancel")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<BulkDeleteDialog
				open={confirming}
				onOpenChange={setConfirming}
				title={t("bulkDeleteConfirmTitle", { count: ids.length })}
				description={t("bulkDeleteConfirmDescription")}
				onConfirm={() => remove.mutate({ ids })}
			/>
		</>
	);
}
