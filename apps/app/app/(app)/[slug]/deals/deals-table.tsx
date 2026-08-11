"use client";

import {
	DataTable,
	type DataTableColumn,
	type DataTableFacet,
} from "@crm/ui/components/data-table";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import { useTableSelection } from "@crm/ui/hooks/use-table-selection";
import { formatMoney } from "@crm/ui/lib/format";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { CLOSING_OPTIONS } from "@/components/crm/closing-window";
import { CompanyCell } from "@/components/crm/company-cell";
import { useFieldColumns } from "@/components/crm/fields/field-columns";
import { OwnerCell } from "@/components/crm/owner-cell";
import { usePrefetchRecord } from "@/components/crm/record-sheet/record-prefetch";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import { DealStageMenu } from "@/components/crm/stage-change";
import { ListSearch } from "@/components/data-table/list-search";
import { useTableQuery } from "@/components/data-table/use-table-query";
import { LocalDay, LocalRelativeTime } from "@/components/local-date-time";
import { DEAL_STAGE_OPTIONS } from "@/lib/deal-stage";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { DealsBulkActions } from "./deals-bulk-actions";
import { dealsSearchParams } from "./deals-search-params";

type DealRow = RouterOutputs["deals"]["list"]["rows"][number];

function columns(
	t: ReturnType<typeof useTranslations<"deals">>,
	common: ReturnType<typeof useTranslations<"common">>,
): DataTableColumn<DealRow>[] {
	return [
		{
			id: "name",
			header: t("nameLabel"),
			sortable: true,
			hideable: false,
			width: "w-[24%]",
			cell: (row) => <span className="truncate font-medium">{row.name}</span>,
		},
		{
			id: "company",
			header: t("companyLabel"),
			sortable: true,
			width: "w-[18%]",
			cell: (row) => <CompanyCell company={row.company} />,
		},
		{
			id: "stage",
			header: t("stageLabel"),
			sortable: true,
			width: "w-[18%]",
			cell: (row) => <DealStageMenu dealId={row.id} stage={row.stage} />,
		},
		{
			id: "amount",
			header: t("amountLabel"),
			sortable: true,
			align: "right",
			width: "w-[12%]",
			hideBelow: "sm",
			cell: (row) =>
				row.amountCents === null ? (
					<EmptyCellValue />
				) : (
					<span className="tabular-nums">
						{formatMoney(row.amountCents, row.currency)}
					</span>
				),
		},
		{
			id: "owner",
			header: common("ownerLabel"),
			sortable: true,
			width: "w-[14%]",
			hideBelow: "md",
			cell: (row) => <OwnerCell owner={row.owner} />,
		},
		{
			id: "expectedCloseDate",
			header: t("closeDateLabel"),
			sortable: true,
			width: "w-[12%]",
			hideBelow: "lg",
			cell: (row) =>
				row.expectedCloseDate ? (
					<span className="text-muted-foreground">
						<LocalDay date={row.expectedCloseDate} />
					</span>
				) : (
					<EmptyCellValue />
				),
		},
		{
			id: "createdAt",
			header: t("createdColumnLabel"),
			label: t("createdColumnFullLabel"),
			sortable: true,
			align: "right",
			width: "w-[10%]",
			defaultHidden: true,
			cell: (row) => (
				<span className="text-muted-foreground">
					<LocalRelativeTime date={row.createdAt} />
				</span>
			),
		},
		{
			id: "lastActivity",
			header: t("lastActivityColumnLabel"),
			sortable: true,
			align: "right",
			width: "w-[12%]",
			hideBelow: "lg",
			cell: (row) => (
				<span className="text-muted-foreground">
					{row.lastActivityAt ? (
						<LocalRelativeTime date={row.lastActivityAt} />
					) : (
						<EmptyCellValue />
					)}
				</span>
			),
		},
	];
}

export function DealsTable() {
	const t = useTranslations("deals");
	const common = useTranslations("common");
	const openRecord = useOpenRecord();
	const trpc = useTRPC();
	const prefetchRecord = usePrefetchRecord();
	const { query, input } = useTableQuery(dealsSearchParams);

	const deals = useQuery({
		...trpc.deals.list.queryOptions(input),
		placeholderData: (previous) => previous,
	});
	const users = useQuery(trpc.users.list.queryOptions());

	const rows = deals.data?.rows ?? [];
	const selection = useTableSelection(
		useMemo(() => rows.map((row) => row.id), [rows]),
	);

	const facetCounts = deals.data?.facetCounts;

	const facets: DataTableFacet[] = [
		{
			id: "owner",
			label: common("ownerLabel"),
			options: (users.data ?? []).flatMap((user) =>
				(facetCounts?.owner?.[user.id] ?? 0) > 0
					? [{ value: user.id, label: user.name }]
					: [],
			),
		},
		{
			id: "stage",
			label: t("stageLabel"),
			options: DEAL_STAGE_OPTIONS.filter(
				(option) => (facetCounts?.stage?.[option.value] ?? 0) > 0,
			),
		},
		{
			id: "closing",
			label: t("closingFacetLabel"),
			options: CLOSING_OPTIONS.flatMap((option) =>
				(facetCounts?.closing?.[option.value] ?? 0) > 0
					? [{ value: option.value, label: t(option.key) }]
					: [],
			),
		},
	];

	const openValueCents = deals.data?.openValueCents;
	const reportingCurrency = deals.data?.reportingCurrency;
	const unconverted = deals.data?.unconverted;
	const uncounted = unconverted?.count ?? 0;
	const openPipelineCents = openValueCents ?? (uncounted > 0 ? 0 : null);

	const fieldColumns = useFieldColumns<DealRow>("DEAL");
	const dataColumns = useMemo(
		() => [...columns(t, common), ...fieldColumns],
		[t, common, fieldColumns],
	);

	return (
		<DataTable
			query={query}
			search={<ListSearch placeholder={t("searchPlaceholder")} />}
			columns={dataColumns}
			rows={rows}
			total={deals.data?.total ?? 0}
			facetCounts={facetCounts}
			facets={facets}
			tabs={{
				id: "status",
				allLabel: t("stageAllTabLabel"),
				options: [
					{ value: "open", label: t("stageOpenOption") },
					{ value: "closed", label: t("stageClosedOption") },
				],
			}}
			selection={{
				state: selection,
				actions: (
					<DealsBulkActions ids={selection.ids} onDone={selection.clear} />
				),
				rowLabel: (row) => row.name,
			}}
			getRowId={(row) => row.id}
			loading={deals.isFetching}
			onRowHover={(row) => prefetchRecord({ kind: "deal", id: row.id })}
			onRowClick={(row) => openRecord({ kind: "deal", id: row.id })}
			empty={t("emptyState")}
			meta={
				openPipelineCents === null ? undefined : (
					<span>
						{t.rich("pipelineSummary", {
							count: deals.data?.total ?? 0,
							amount: () => (
								<span className="tabular-nums">
									{formatMoney(openPipelineCents, reportingCurrency)}
								</span>
							),
						})}
						{unconverted && unconverted.count > 0 ? (
							<span className="text-muted-foreground">
								{t("pipelineUncountedSuffix", {
									count: unconverted.count,
									currencies: unconverted.currencies.join(", "),
								})}
							</span>
						) : null}
					</span>
				)
			}
		/>
	);
}
