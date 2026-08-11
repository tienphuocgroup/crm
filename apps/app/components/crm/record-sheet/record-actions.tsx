"use client";

import OverflowMenuVertical from "@carbon/icons-react/es/OverflowMenuVertical";
import TrashCan from "@carbon/icons-react/es/TrashCan";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@crm/ui/components/alert-dialog";
import { Button } from "@crm/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import { Icon } from "@crm/ui/components/icon";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import {
	type RecordKind,
	type RecordRef,
	useRecordStack,
} from "./record-stack";

function useDeleteRecord(
	record: RecordRef,
	recordNounWithArticle: Record<RecordKind, string>,
	common: ReturnType<typeof useTranslations<"common">>,
) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const { close } = useRecordStack();

	const handlers = {
		onSuccess: (deleted: { name: string }) => {
			toast.success(
				common("recordSheet.deletedToast", {
					subject: deleted.name || recordNounWithArticle[record.kind],
				}),
			);
			void cache.removed(record);
			close();
		},
		onError: (error: { message: string }) => toast.error(error.message),
	};

	const options =
		record.kind === "contact"
			? trpc.contacts.delete.mutationOptions(handlers)
			: record.kind === "company"
				? trpc.companies.delete.mutationOptions(handlers)
				: trpc.deals.delete.mutationOptions(handlers);

	return useMutation(options);
}

export function RecordActions({
	record,
	name,
	consequence,
}: {
	record: RecordRef;
	name: string;
	consequence: string;
}) {
	const common = useTranslations("common");
	const companies = useTranslations("companies");
	const contacts = useTranslations("contacts");
	const deals = useTranslations("deals");

	const deleteMenuLabel: Record<RecordKind, string> = {
		company: companies("deleteMenuLabel"),
		contact: contacts("deleteMenuLabel"),
		deal: deals("deleteMenuLabel"),
	};

	const recordNounWithArticle: Record<RecordKind, string> = {
		company: companies("recordNounWithArticle"),
		contact: contacts("recordNounWithArticle"),
		deal: deals("recordNounWithArticle"),
	};

	const [confirming, setConfirming] = useState(false);
	const remove = useDeleteRecord(record, recordNounWithArticle, common);

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="ghost" size="icon-sm" disabled={remove.isPending}>
						<Icon icon={OverflowMenuVertical} />
						<span className="sr-only">
							{common("recordSheet.moreActionsLabel")}
						</span>
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="min-w-44">
					<DropdownMenuItem
						variant="destructive"
						onSelect={() => setConfirming(true)}
					>
						<Icon icon={TrashCan} />
						{deleteMenuLabel[record.kind]}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<AlertDialog open={confirming} onOpenChange={setConfirming}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{common("recordSheet.deleteConfirmTitle", { name })}
						</AlertDialogTitle>
						<AlertDialogDescription>{consequence}</AlertDialogDescription>
					</AlertDialogHeader>

					<AlertDialogFooter>
						<AlertDialogCancel>{common("cancel")}</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							onClick={() => remove.mutate({ id: record.id })}
						>
							{common("delete")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
