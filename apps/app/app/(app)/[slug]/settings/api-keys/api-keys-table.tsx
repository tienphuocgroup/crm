"use client";

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
	AlertDialogTrigger,
} from "@crm/ui/components/alert-dialog";
import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import { DataTable, type DataTableColumn } from "@crm/ui/components/data-table";
import { Icon } from "@crm/ui/components/icon";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ListSearch } from "@/components/data-table/list-search";
import { useTableQuery } from "@/components/data-table/use-table-query";
import { LocalRelativeTime } from "@/components/local-date-time";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { apiKeysSearchParams } from "./api-keys-search-params";

type ApiKeyRow = RouterOutputs["apiKeys"]["list"]["rows"][number];

function isExpired(expiresAt: string | null): boolean {
	return expiresAt !== null && new Date(expiresAt).getTime() < Date.now();
}

function columns(
	t: ReturnType<typeof useTranslations>,
	common: ReturnType<typeof useTranslations>,
	onRevoke: (apiKey: ApiKeyRow) => void,
	pending: boolean,
): DataTableColumn<ApiKeyRow>[] {
	return [
		{
			id: "name",
			header: t("apiKeys.nameColumnLabel"),
			sortable: true,
			hideable: false,
			width: "w-[28%]",
			cell: (row) => (
				<span className="truncate font-medium">
					{row.name ?? t("apiKeys.untitledKey")}
				</span>
			),
		},
		{
			id: "start",
			header: t("apiKeys.keyColumnLabel"),
			width: "w-[20%]",
			hideBelow: "sm",
			cell: (row) => (
				<Badge variant="mono">{row.start ? `${row.start}…` : "—"}</Badge>
			),
		},
		{
			id: "createdAt",
			header: t("apiKeys.createdColumnLabel"),
			sortable: true,
			width: "w-[16%]",
			hideBelow: "md",
			cell: (row) => (
				<span className="text-muted-foreground">
					<LocalRelativeTime date={row.createdAt} />
				</span>
			),
		},
		{
			id: "lastRequest",
			header: t("apiKeys.lastUsedColumnLabel"),
			label: t("apiKeys.lastUsedColumnFullLabel"),
			sortable: true,
			width: "w-[16%]",
			hideBelow: "lg",
			cell: (row) => (
				<span className="text-muted-foreground">
					{row.lastRequest ? (
						<LocalRelativeTime date={row.lastRequest} />
					) : (
						t("apiKeys.never")
					)}
				</span>
			),
		},
		{
			id: "expiresAt",
			header: t("apiKeys.expiresColumnLabel"),
			sortable: true,
			width: "w-[14%]",
			hideBelow: "lg",
			cell: (row) =>
				row.expiresAt ? (
					<span
						className={
							isExpired(row.expiresAt)
								? "text-destructive"
								: "text-muted-foreground"
						}
					>
						<LocalRelativeTime date={row.expiresAt} />
					</span>
				) : (
					<span className="text-muted-foreground">{t("apiKeys.never")}</span>
				),
		},
		{
			id: "actions",
			header: <span className="sr-only">{common("actions")}</span>,
			label: common("actions"),
			hideable: false,
			align: "right",
			width: "w-[6%]",
			cell: (row) => (
				<AlertDialog>
					<AlertDialogTrigger asChild>
						<Button variant="ghost" size="icon" disabled={pending}>
							<Icon icon={TrashCan} />
							<span className="sr-only">
								{t("apiKeys.revokePrompt", {
									name: row.name ?? t("apiKeys.thisKey"),
								})}
							</span>
						</Button>
					</AlertDialogTrigger>

					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>
								{t("apiKeys.revokeConfirmTitle", {
									name: row.name ?? t("apiKeys.thisKey"),
								})}
							</AlertDialogTitle>
							<AlertDialogDescription>
								{t("apiKeys.revokeConfirmDescription")}
							</AlertDialogDescription>
						</AlertDialogHeader>

						<AlertDialogFooter>
							<AlertDialogCancel>{common("cancel")}</AlertDialogCancel>
							<AlertDialogAction
								variant="destructive"
								onClick={() => onRevoke(row)}
							>
								{t("apiKeys.revoke")}
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			),
		},
	];
}

export function ApiKeysTable() {
	const t = useTranslations("settings");
	const common = useTranslations("common");
	const trpc = useTRPC();
	const cache = useCrmCache();
	const { query, input } = useTableQuery(apiKeysSearchParams);

	const apiKeys = useQuery({
		...trpc.apiKeys.list.queryOptions(input),
		placeholderData: (previous) => previous,
	});

	const revoke = useMutation(
		trpc.apiKeys.revoke.mutationOptions({
			onSuccess: async () => {
				if (apiKeys.data?.rows.length === 1 && query.page > 1) {
					await query.setPage(query.page - 1);
				}
				await cache.apiKeys();
				toast.success(t("apiKeys.revokedToast"));
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<DataTable
			query={query}
			search={<ListSearch placeholder={t("apiKeys.searchPlaceholder")} />}
			columns={columns(
				t,
				common,
				(apiKey) => revoke.mutate({ id: apiKey.id }),
				revoke.isPending,
			)}
			rows={apiKeys.data?.rows ?? []}
			total={apiKeys.data?.total ?? 0}
			getRowId={(row) => row.id}
			loading={apiKeys.isFetching}
			empty={t("apiKeys.empty")}
		/>
	);
}
