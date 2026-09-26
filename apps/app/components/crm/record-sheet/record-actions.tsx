"use client";

import Archive from "@carbon/icons-react/es/Archive";
import OverflowMenuVertical from "@carbon/icons-react/es/OverflowMenuVertical";
import TrashCan from "@carbon/icons-react/es/TrashCan";
import Undo from "@carbon/icons-react/es/Undo";
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

const RECORD_PROCEDURES = {
	company: "companies",
	contact: "contacts",
	deal: "deals",
} satisfies Record<RecordKind, "companies" | "contacts" | "deals">;

type RecordToast = {
	record: RecordRef;
	nounWithArticle: string;
	common: ReturnType<typeof useTranslations<"common">>;
};

function useArchiveRecord({ record, nounWithArticle, common }: RecordToast) {
	const trpc = useTRPC();
	const cache = useCrmCache();

	const handlers = {
		onSuccess: (archived: { name: string }) => {
			toast.success(
				common("recordSheet.archivedToast", {
					subject: archived.name || nounWithArticle,
				}),
			);
			void cache[record.kind](record.id);
		},
		onError: (error: { message: string }) => toast.error(error.message),
	};

	return useMutation(
		trpc[RECORD_PROCEDURES[record.kind]].archive.mutationOptions(handlers),
	);
}

function useRestoreRecord({ record, nounWithArticle, common }: RecordToast) {
	const trpc = useTRPC();
	const cache = useCrmCache();

	const handlers = {
		onSuccess: (restored: { name: string }) => {
			toast.success(
				common("recordSheet.restoredToast", {
					subject: restored.name || nounWithArticle,
				}),
			);
			void cache[record.kind](record.id);
		},
		onError: (error: { message: string }) => toast.error(error.message),
	};

	return useMutation(
		trpc[RECORD_PROCEDURES[record.kind]].restore.mutationOptions(handlers),
	);
}

function usePurgeRecord({ record, nounWithArticle, common }: RecordToast) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const { close } = useRecordStack();

	const handlers = {
		onSuccess: (purged: { name: string }) => {
			toast.success(
				common("recordSheet.deletedToast", {
					subject: purged.name || nounWithArticle,
				}),
			);
			void cache.removed(record);
			close();
		},
		onError: (error: { message: string }) => toast.error(error.message),
	};

	return useMutation(
		trpc[RECORD_PROCEDURES[record.kind]].purge.mutationOptions(handlers),
	);
}

export function RecordActions({
	record,
	name,
	consequence,
	archivedAt,
}: {
	record: RecordRef;
	name: string;
	consequence: string;
	archivedAt: string | null;
}) {
	const common = useTranslations("common");
	const companies = useTranslations("companies");
	const contacts = useTranslations("contacts");
	const deals = useTranslations("deals");

	const archiveMenuLabel = {
		company: companies("archiveMenuLabel"),
		contact: contacts("archiveMenuLabel"),
		deal: deals("archiveMenuLabel"),
	} satisfies Record<RecordKind, string>;

	const restoreMenuLabel = {
		company: companies("restoreMenuLabel"),
		contact: contacts("restoreMenuLabel"),
		deal: deals("restoreMenuLabel"),
	} satisfies Record<RecordKind, string>;

	const purgeMenuLabel = {
		company: companies("purgeMenuLabel"),
		contact: contacts("purgeMenuLabel"),
		deal: deals("purgeMenuLabel"),
	} satisfies Record<RecordKind, string>;

	const recordNounWithArticle = {
		company: companies("recordNounWithArticle"),
		contact: contacts("recordNounWithArticle"),
		deal: deals("recordNounWithArticle"),
	} satisfies Record<RecordKind, string>;

	const [confirming, setConfirming] = useState(false);
	const toastArgs = {
		record,
		nounWithArticle: recordNounWithArticle[record.kind],
		common,
	};
	const archive = useArchiveRecord(toastArgs);
	const restore = useRestoreRecord(toastArgs);
	const purge = usePurgeRecord(toastArgs);

	const pending = archive.isPending || restore.isPending || purge.isPending;

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="ghost" size="icon-sm" disabled={pending}>
						<Icon icon={OverflowMenuVertical} />
						<span className="sr-only">
							{common("recordSheet.moreActionsLabel")}
						</span>
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="min-w-44">
					{archivedAt ? (
						<>
							<DropdownMenuItem
								onSelect={() => restore.mutate({ id: record.id })}
							>
								<Icon icon={Undo} />
								{restoreMenuLabel[record.kind]}
							</DropdownMenuItem>
							<DropdownMenuItem
								variant="destructive"
								onSelect={() => setConfirming(true)}
							>
								<Icon icon={TrashCan} />
								{purgeMenuLabel[record.kind]}
							</DropdownMenuItem>
						</>
					) : (
						<DropdownMenuItem
							onSelect={() => archive.mutate({ id: record.id })}
						>
							<Icon icon={Archive} />
							{archiveMenuLabel[record.kind]}
						</DropdownMenuItem>
					)}
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
							onClick={() => purge.mutate({ id: record.id })}
						>
							{common("recordSheet.purgeConfirmAction")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
