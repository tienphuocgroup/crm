"use client";

import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { CardTableEmpty } from "@crm/ui/components/card-table";
import {
	SimpleTable,
	type SimpleTableColumn,
	SimpleTableRow,
} from "@crm/ui/components/simple-table";
import { TableCell } from "@crm/ui/components/table";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useTRPC } from "@/lib/trpc/client";

const CELL = "px-3 py-2.5 align-middle";

function columns(t: ReturnType<typeof useTranslations>): SimpleTableColumn[] {
	return [
		{ id: "source", header: t("tracking.sourceColumnLabel") },
		{ id: "medium", header: t("tracking.mediumColumnLabel"), width: "w-32" },
		{
			id: "views",
			header: t("tracking.pageViewsColumnLabel"),
			width: "w-28",
			align: "right",
		},
		{
			id: "contacts",
			header: t("tracking.contactsColumnLabel"),
			width: "w-24",
			align: "right",
		},
	];
}

export function TrafficSources() {
	const t = useTranslations("settings");
	const trpc = useTRPC();
	const sources = useQuery(trpc.tracking.sources.queryOptions());

	if (!sources.data) return null;

	return (
		<Card>
			<CardHeader>
				<CardTitle>{t("tracking.trafficSourcesTitle")}</CardTitle>
				<CardDescription>
					{t("tracking.trafficSourcesDescription")}
				</CardDescription>
			</CardHeader>

			{sources.data.length === 0 ? (
				<CardTableEmpty>{t("tracking.trafficSourcesEmpty")}</CardTableEmpty>
			) : (
				<SimpleTable columns={columns(t)}>
					{sources.data.map((row) => (
						<SimpleTableRow key={`${row.source}-${row.medium ?? ""}`}>
							<TableCell className={CELL}>{row.source}</TableCell>
							<TableCell className={`${CELL} text-muted-foreground`}>
								{row.medium ?? "—"}
							</TableCell>
							<TableCell className={`${CELL} text-right tabular-nums`}>
								{row.views.toLocaleString()}
							</TableCell>
							<TableCell className={`${CELL} text-right tabular-nums`}>
								{row.contacts.toLocaleString()}
							</TableCell>
						</SimpleTableRow>
					))}
				</SimpleTable>
			)}
		</Card>
	);
}
