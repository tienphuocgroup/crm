"use client";

import {
	DataTable,
	type DataTableColumn,
	type DataTableFacet,
} from "@crm/ui/components/data-table";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import {
	EntityLogo,
	type EntityLogoTone,
} from "@crm/ui/components/entity-logo";
import { useTableSelection } from "@crm/ui/hooks/use-table-selection";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { EnrichmentIndicator } from "@/components/crm/enrichment-status";
import { useFieldColumns } from "@/components/crm/fields/field-columns";
import { OwnerCell } from "@/components/crm/owner-cell";
import { usePrefetchRecord } from "@/components/crm/record-sheet/record-prefetch";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import { ListSearch } from "@/components/data-table/list-search";
import { useTableQuery } from "@/components/data-table/use-table-query";
import { LocalRelativeTime } from "@/components/local-date-time";
import {
	ENRICHMENT_FACET_OPTIONS,
	ENRICHMENT_POLL_MS,
	isEnriching,
} from "@/lib/enrichment-status";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { CompaniesBulkActions } from "./companies-bulk-actions";
import { companiesSearchParams } from "./companies-search-params";

type CompanyRow = RouterOutputs["companies"]["list"]["rows"][number];

function columns(
	t: ReturnType<typeof useTranslations<"companies">>,
	common: ReturnType<typeof useTranslations<"common">>,
): DataTableColumn<CompanyRow>[] {
	return [
		{
			id: "name",
			header: t("nameColumnLabel"),
			sortable: true,
			hideable: false,
			width: "w-[26%]",
			cell: (row) => (
				<span className="flex min-w-0 items-center gap-2.5">
					<EntityLogo
						src={row.iconUrl ?? row.logoUrl}
						darkSrc={row.iconDarkUrl}
						tone={row.iconTone as EntityLogoTone | null | undefined}
						name={row.name}
						size="sm"
					/>
					<span className="truncate font-medium">{row.name}</span>
				</span>
			),
		},
		{
			id: "domain",
			header: t("domainColumnLabel"),
			sortable: true,
			width: "w-[16%]",
			hideBelow: "md",
			cell: (row) =>
				row.domain ? (
					<span className="truncate text-muted-foreground">{row.domain}</span>
				) : (
					<EmptyCellValue />
				),
		},
		{
			id: "industry",
			header: t("industryColumnLabel"),
			sortable: true,
			width: "w-[16%]",
			hideBelow: "lg",
			cell: (row) =>
				row.industry ? (
					<span className="truncate">{row.industry}</span>
				) : (
					<EmptyCellValue />
				),
		},
		{
			id: "owner",
			header: common("ownerLabel"),
			sortable: true,
			width: "w-[16%]",
			hideBelow: "md",
			cell: (row) => <OwnerCell owner={row.owner} />,
		},
		{
			id: "contacts",
			header: t("contactsColumnLabel"),
			sortable: true,
			align: "right",
			width: "w-[9%]",
			hideBelow: "lg",
			cell: (row) => <span className="tabular-nums">{row.contactCount}</span>,
		},
		{
			id: "deals",
			header: t("openDealsColumnLabel"),
			sortable: true,
			align: "right",
			width: "w-[9%]",
			cell: (row) => <span className="tabular-nums">{row.openDealCount}</span>,
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
			hideBelow: "sm",
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
		{
			id: "enrichment",
			header: t("enrichmentColumnLabel"),
			label: t("enrichmentColumnFullLabel"),
			defaultHidden: true,
			width: "w-[14%]",
			cell: (row) => (
				<EnrichmentIndicator
					status={row.enrichmentStatus}
					queued={row.queued}
				/>
			),
		},
	];
}

export function CompaniesTable() {
	const t = useTranslations("companies");
	const common = useTranslations("common");
	const openRecord = useOpenRecord();
	const trpc = useTRPC();
	const prefetchRecord = usePrefetchRecord();
	const { query, input } = useTableQuery(companiesSearchParams);

	const companies = useQuery({
		...trpc.companies.list.queryOptions(input),
		placeholderData: (previous) => previous,
		refetchInterval: (query) =>
			query.state.data?.rows.some((row) =>
				isEnriching(row.enrichmentStatus, row.queued),
			)
				? ENRICHMENT_POLL_MS
				: false,
	});
	const users = useQuery(trpc.users.list.queryOptions());

	const rows = companies.data?.rows ?? [];
	const selection = useTableSelection(
		useMemo(() => rows.map((row) => row.id), [rows]),
	);

	const facetCounts = companies.data?.facetCounts;

	const facets: DataTableFacet[] = [
		{
			id: "owner",
			label: common("ownerLabel"),
			options: [
				{ value: "unassigned", label: common("unassignedOption") },
				...(users.data ?? []).map((user) => ({
					value: user.id,
					label: user.name,
				})),
			].filter((option) => (facetCounts?.owner?.[option.value] ?? 0) > 0),
		},
		{
			id: "industry",
			label: t("industryColumnLabel"),
			options: Object.keys(facetCounts?.industry ?? {})
				.sort()
				.map((value) => ({ value, label: value })),
		},
		{
			id: "enrichment",
			label: t("enrichmentColumnLabel"),
			options: ENRICHMENT_FACET_OPTIONS.filter(
				(option) => (facetCounts?.enrichment?.[option.value] ?? 0) > 0,
			),
		},
	];

	const fieldColumns = useFieldColumns<CompanyRow>("COMPANY");
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
			total={companies.data?.total ?? 0}
			facetCounts={facetCounts}
			facets={facets}
			selection={{
				state: selection,
				actions: (
					<CompaniesBulkActions ids={selection.ids} onDone={selection.clear} />
				),
				rowLabel: (row) => row.name,
			}}
			getRowId={(row) => row.id}
			loading={companies.isFetching}
			onRowHover={(row) => prefetchRecord({ kind: "company", id: row.id })}
			onRowClick={(row) => openRecord({ kind: "company", id: row.id })}
			empty={t("emptyState")}
		/>
	);
}
