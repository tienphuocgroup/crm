"use client";

import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import type { ChartConfig } from "@crm/ui/components/chart";
import { DashboardRow, StatGroup } from "@crm/ui/components/dashboard";
import { StatCard, type StatDelta } from "@crm/ui/components/stat-card";
import {
	formatMoney,
	formatMoneyCompact,
	formatPercent,
} from "@crm/ui/lib/format";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { AreaTrend, DonutStat } from "@/components/dashboard-charts";
import { dealStageColor, dealStageLabelKey } from "@/lib/deal-stage";
import type { RouterOutputs } from "@/lib/trpc/types";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

type Summary = RouterOutputs["dashboard"]["summary"];

function trendConfig(t: ReturnType<typeof useTranslations>): ChartConfig {
	return {
		won: { label: t("closedWonSeriesLabel"), color: "var(--success)" },
		created: { label: t("newPipelineSeriesLabel"), color: "var(--chart-1)" },
	};
}

function changeDelta(
	current: number,
	previous: number,
	label: string,
): StatDelta | undefined {
	if (previous === 0) return undefined;
	const change = Math.round(((current - previous) / previous) * 100);
	return {
		value: `${change >= 0 ? "+" : ""}${change}%`,
		direction: change > 0 ? "up" : change < 0 ? "down" : "neutral",
		label,
	};
}

export function SalesDashboard({ summary }: { summary: Summary }) {
	const t = useTranslations("dashboard");
	const deals = useTranslations("deals");
	const workspaceUrl = useWorkspaceUrl();

	const {
		pipeline,
		wonThisMonth,
		wonPrevMonth,
		performance,
		trend,
		closingThisMonthTotal,
		reportingCurrency,
		unconverted,
	} = summary;

	const money = (cents: number) => formatMoneyCompact(cents, reportingCurrency);
	const exact = (value: unknown) =>
		formatMoney(
			typeof value === "number" ? value : Number(value),
			reportingCurrency,
		);

	const hasTrend = trend.some((point) => point.won > 0 || point.created > 0);

	const stageSlices = pipeline.stages.flatMap((stage) =>
		stage.valueCents > 0
			? [
					{
						key: stage.stage,
						label: deals(dealStageLabelKey(stage.stage)),
						value: stage.valueCents,
						color: dealStageColor(stage.stage),
						count: stage.count,
					},
				]
			: [],
	);

	return (
		<div className="flex flex-col gap-6">
			<StatGroup>
				<StatCard
					label={t("closedWonThisMonthLabel")}
					value={money(wonThisMonth.valueCents)}
					delta={changeDelta(
						wonThisMonth.valueCents,
						wonPrevMonth.valueCents,
						t("vsLastMonthLabel"),
					)}
					description={t("wonThisMonthDescription", {
						deals: t("dealCount", { count: wonThisMonth.count }),
						amount: money(wonPrevMonth.valueCents),
					})}
				/>
				<StatCard
					label={t("openPipelineLabel")}
					value={money(pipeline.totalCents)}
					description={t("openPipelineDescription", {
						deals: t("dealCount", { count: pipeline.totalDeals }),
						amount: money(closingThisMonthTotal.valueCents),
					})}
				/>
				<StatCard
					label={t("winRateLabel", { days: performance.windowDays })}
					value={
						performance.winRate === null
							? "—"
							: formatPercent(performance.winRate)
					}
					description={
						performance.wins + performance.losses === 0
							? t("nothingClosedYet")
							: t("winsLossesSummary", {
									wins: performance.wins,
									losses: performance.losses,
								})
					}
				/>
				<StatCard
					label={t("averageDealLabel", { days: performance.windowDays })}
					value={
						performance.avgDealCents === null
							? "—"
							: money(performance.avgDealCents)
					}
					description={
						performance.avgCycleDays === null
							? t("noWinsToMeasure")
							: t("averageCycleDays", { days: performance.avgCycleDays })
					}
				/>
			</StatGroup>

			{unconverted.count > 0 ? (
				<p className="text-muted-foreground text-xs">
					{t("figuresInCurrencyNotice", { currency: reportingCurrency })}{" "}
					{t("unconvertedCurrenciesNotice", {
						count: unconverted.count,
						currencies: unconverted.currencies.join(", "),
						currencyCount: unconverted.currencies.length,
					})}{" "}
					<Link
						href={workspaceUrl("/settings/currencies")}
						className="underline hover:no-underline"
					>
						{t("setOneLink")}
					</Link>
					.
				</p>
			) : null}

			<DashboardRow split="hero">
				<ChartPanel
					title={t("closedWonVsNewPipelineTitle")}
					description={t("closedWonVsNewPipelineDescription")}
				>
					{hasTrend ? (
						<div className="flex flex-1 flex-col justify-center py-4">
							<AreaTrend
								data={trend}
								config={trendConfig(t)}
								xKey="month"
								height={196}
								variant="gradient"
								bloom="high"
								showLegend
								formatValue={exact}
							/>
						</div>
					) : (
						<EmptyChart label={t("noDealsClosedOrCreatedYet")} />
					)}
				</ChartPanel>

				<ChartPanel
					title={t("openPipelineByStageTitle")}
					description={t("openPipelineByStageDescription")}
				>
					{stageSlices.length > 0 ? (
						<div className="flex flex-1 flex-col justify-between gap-1 pt-4">
							<DonutStat
								data={stageSlices}
								height={168}
								centerValue={money(pipeline.totalCents)}
								centerLabel={t("openCenterLabel")}
								formatValue={exact}
							/>
							<ul className="flex flex-col px-5 pb-1 md:px-6">
								{stageSlices.map((slice) => (
									<li key={slice.key} className="border-t first:border-t-0">
										<Link
											href={`${workspaceUrl("/deals")}?stage=${slice.key}`}
											className="flex items-center gap-2.5 py-2 text-xs hover:underline"
										>
											<span
												aria-hidden
												className="size-1.5 shrink-0"
												style={{ backgroundColor: slice.color }}
											/>
											<span className="min-w-0 flex-1 truncate">
												{slice.label}
											</span>
											<span className="shrink-0 text-muted-foreground tabular-nums">
												{slice.count}
											</span>
											<span className="w-14 shrink-0 text-right font-medium tabular-nums">
												{money(slice.value)}
											</span>
										</Link>
									</li>
								))}
							</ul>
						</div>
					) : (
						<EmptyChart label={t("nothingOpenChart")} />
					)}
				</ChartPanel>
			</DashboardRow>
		</div>
	);
}

function ChartPanel({
	title,
	description,
	children,
}: {
	title: string;
	description?: string;
	children: ReactNode;
}) {
	return (
		<Card className="min-w-0">
			<CardHeader>
				<CardTitle>{title}</CardTitle>
				{description ? <CardDescription>{description}</CardDescription> : null}
			</CardHeader>
			<div className="flex flex-1 flex-col border">{children}</div>
		</Card>
	);
}

function EmptyChart({ label }: { label: string }) {
	return (
		<div className="flex flex-1 items-center justify-center px-5 py-10 text-muted-foreground text-sm md:px-6">
			{label}
		</div>
	);
}
