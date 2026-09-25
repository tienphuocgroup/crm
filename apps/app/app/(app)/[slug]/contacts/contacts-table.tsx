"use client";

import Archive from "@carbon/icons-react/es/Archive";
import { Button } from "@crm/ui/components/button";
import {
	DataTable,
	type DataTableColumn,
	type DataTableFacet,
} from "@crm/ui/components/data-table";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import { PersonAvatar } from "@crm/ui/components/person-avatar";
import { useSearchInput } from "@crm/ui/hooks/use-search-input";
import { useTableSelection } from "@crm/ui/hooks/use-table-selection";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { CompanyCell } from "@/components/crm/company-cell";
import { contactName } from "@/components/crm/contact-name";
import { useFieldColumns } from "@/components/crm/fields/field-columns";
import { useFieldFacets } from "@/components/crm/fields/field-facets";
import { OwnerCell } from "@/components/crm/owner-cell";
import { usePrefetchRecord } from "@/components/crm/record-sheet/record-prefetch";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import { ListSearch } from "@/components/data-table/list-search";
import { SavedViewsMenu } from "@/components/data-table/saved-views-menu";
import { useTableQuery } from "@/components/data-table/use-table-query";
import { LocalRelativeTime } from "@/components/local-date-time";
import { ACTIVITY_FACET_OPTIONS } from "@/lib/activity-recency";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { ContactsBulkActions } from "./contacts-bulk-actions";
import { contactsSearchParams } from "./contacts-search-params";

type ContactRow = RouterOutputs["contacts"]["list"]["rows"][number];

function columns(
	t: ReturnType<typeof useTranslations<"contacts">>,
	common: ReturnType<typeof useTranslations<"common">>,
): DataTableColumn<ContactRow>[] {
	return [
		{
			id: "name",
			header: t("nameColumnLabel"),
			sortable: true,
			hideable: false,
			width: "w-[22%]",
			cell: (row) => (
				<span className="flex min-w-0 items-center gap-2">
					<PersonAvatar
						src={row.imageUrl}
						name={contactName(row)}
						email={row.email}
						size="sm"
					/>
					<span className="truncate font-medium">{contactName(row)}</span>
				</span>
			),
		},
		{
			id: "title",
			header: t("titleColumnLabel"),
			sortable: true,
			width: "w-[20%]",
			hideBelow: "lg",
			cell: (row) =>
				row.title ? (
					<span className="truncate">{row.title}</span>
				) : (
					<EmptyCellValue />
				),
		},
		{
			id: "email",
			header: t("emailLabel"),
			sortable: true,
			width: "w-[24%]",
			hideBelow: "md",
			cell: (row) =>
				row.email ? (
					<span className="truncate text-muted-foreground">{row.email}</span>
				) : (
					<EmptyCellValue />
				),
		},
		{
			id: "company",
			header: t("companyLabel"),
			sortable: true,
			width: "w-[18%]",
			cell: (row) => <CompanyCell company={row.company} />,
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
	];
}

function archivedColumn(
	t: ReturnType<typeof useTranslations<"contacts">>,
): DataTableColumn<ContactRow> {
	return {
		id: "archivedAt",
		header: t("archivedColumnLabel"),
		label: t("archivedColumnFullLabel"),
		sortable: true,
		align: "right",
		width: "w-[12%]",
		cell: (row) => (
			<span className="text-muted-foreground">
				{row.archivedAt ? (
					<LocalRelativeTime date={row.archivedAt} />
				) : (
					<EmptyCellValue />
				)}
			</span>
		),
	};
}

export function ContactsTable() {
	const t = useTranslations("contacts");
	const common = useTranslations("common");
	const openRecord = useOpenRecord();
	const trpc = useTRPC();
	const prefetchRecord = usePrefetchRecord();
	const table = useTableQuery(contactsSearchParams);
	const { query, input, setArchived } = table;

	const contacts = useQuery({
		...trpc.contacts.list.queryOptions(input),
		placeholderData: (previous) => previous,
	});
	const users = useQuery(trpc.users.list.queryOptions());

	const [companyQuery, setCompanyQuery] = useState("");
	const [companyText, setCompanyText] = useSearchInput(
		companyQuery,
		setCompanyQuery,
	);
	const companies = useQuery({
		...trpc.companies.options.queryOptions({ q: companyQuery }),
		placeholderData: (previous) => previous,
	});

	const rows = contacts.data?.rows ?? [];
	const selection = useTableSelection(
		useMemo(() => rows.map((row) => row.id), [rows]),
	);
	const settledIds = useMemo(() => {
		const matching = new Set(
			rows
				.filter((row) => Boolean(row.archivedAt) === input.archived)
				.map((row) => row.id),
		);
		return selection.ids.filter((id) => matching.has(id));
	}, [rows, input.archived, selection.ids]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: clearing on archived-mode change is the entire purpose of this effect.
	useEffect(() => {
		selection.clear();
	}, [input.archived]);

	const toggleArchived = (next: boolean) => {
		selection.clear();
		if (!next && query.sort === "archivedAt") query.setSort("");
		setArchived(next);
	};

	const facetCounts = contacts.data?.facetCounts;
	const fieldFacets = useFieldFacets("CONTACT", facetCounts);

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
			id: "company",
			label: t("companyLabel"),
			searchable: true,
			search: companyText,
			onSearchChange: setCompanyText,
			stale: companies.isFetching || companyText.trim() !== companyQuery.trim(),
			empty: companies.isFetching
				? t("companyFacetSearching")
				: t("companyFacetEmpty"),
			options: [
				...(companyQuery.trim()
					? []
					: [{ value: "none", label: t("noCompanyOption") }]),
				...(companies.data ?? []).map((company) => ({
					value: company.id,
					label: company.name,
				})),
			].filter((option) => (facetCounts?.company?.[option.value] ?? 0) > 0),
		},
		{
			id: "title",
			label: t("titleLabel"),
			options: Object.keys(facetCounts?.title ?? {})
				.sort()
				.map((value) => ({ value, label: value })),
		},
		{
			id: "seniority",
			label: t("seniorityLabel"),
			options: Object.keys(facetCounts?.seniority ?? {})
				.sort()
				.map((value) => ({ value, label: value })),
		},
		{
			id: "persona",
			label: t("personaLabel"),
			options: Object.keys(facetCounts?.persona ?? {})
				.sort()
				.map((value) => ({ value, label: value })),
		},
		{
			id: "activity",
			label: common("activityFacetLabel"),
			options: ACTIVITY_FACET_OPTIONS.filter(
				(option) => (facetCounts?.activity?.[option.value] ?? 0) > 0,
			).map((option) => ({
				value: option.value,
				label: common("activityFacetWithinDays", { days: option.value }),
			})),
		},
		...fieldFacets,
	];

	const fieldColumns = useFieldColumns<ContactRow>("CONTACT");
	const dataColumns = useMemo(
		() =>
			input.archived
				? [...columns(t, common), archivedColumn(t), ...fieldColumns]
				: [...columns(t, common), ...fieldColumns],
		[t, common, fieldColumns, input.archived],
	);

	return (
		<DataTable
			query={query}
			search={<ListSearch placeholder={t("searchPlaceholder")} />}
			actions={
				<>
					<SavedViewsMenu entity="CONTACT" table={table} />
					<Button
						variant={input.archived ? "contrast" : "outline"}
						size="sm"
						className="justify-start sm:justify-center"
						onClick={() => toggleArchived(!input.archived)}
					>
						<Archive data-icon="inline-start" />
						{common("archivedFilter")}
					</Button>
				</>
			}
			columns={dataColumns}
			rows={rows}
			total={contacts.data?.total ?? 0}
			facetCounts={facetCounts}
			facets={facets}
			selection={{
				state: selection,
				actions: (
					<ContactsBulkActions
						ids={settledIds}
						onDone={selection.clear}
						archived={input.archived}
					/>
				),
				rowLabel: (row) => contactName(row),
			}}
			getRowId={(row) => row.id}
			loading={contacts.isFetching}
			onRowHover={(row) => prefetchRecord({ kind: "contact", id: row.id })}
			onRowClick={(row) => openRecord({ kind: "contact", id: row.id })}
			empty={input.archived ? t("archivedEmptyState") : t("emptyState")}
		/>
	);
}
