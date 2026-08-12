"use client";

import ChevronDown from "@carbon/icons-react/es/ChevronDown";
import ChevronUp from "@carbon/icons-react/es/ChevronUp";
import Download from "@carbon/icons-react/es/Download";
import Renew from "@carbon/icons-react/es/Renew";
import WarningAlt from "@carbon/icons-react/es/WarningAlt";
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
import { Icon } from "@crm/ui/components/icon";
import { cn } from "@crm/ui/lib/utils";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { runFailureReason } from "@/lib/agent-run-failure";
import type { RouterOutputs } from "@/lib/trpc/types";

type Runs = RouterOutputs["agents"]["history"];
type Activity = RouterOutputs["agents"]["activity"];
type RunRow = Omit<Runs[number], "events"> & {
	events: Array<{
		id: string;
		type: string;
		data: unknown;
		emittedAt: string;
	}>;
};
type ActivityRow = Omit<Activity[number], "before" | "after"> & {
	before: unknown;
	after: unknown;
};

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
	month: "short",
	day: "numeric",
	hour: "numeric",
	minute: "2-digit",
	second: "2-digit",
	timeZone: "UTC",
	timeZoneName: "short",
});
const TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
	hour: "2-digit",
	minute: "2-digit",
	second: "2-digit",
	hour12: false,
	timeZone: "UTC",
});

export function AgentRuns({
	runs,
	onCancel,
	cancelling,
	onRetry,
	retryingRunId,
}: {
	runs: Runs;
	onCancel: (runId: string) => void;
	cancelling: boolean;
	onRetry: (runId: string) => void;
	retryingRunId?: string;
}) {
	const t = useTranslations("agent-panel");
	const [outcome, setOutcome] = useState("ALL");
	const [expanded, setExpanded] = useState<string | null>(null);
	const [confirming, setConfirming] = useState<string | null>(null);
	const visible = runs.filter(
		(run) => outcome === "ALL" || run.status === outcome,
	);
	const runNumbers = new Map(
		runs.map((run, index) => [run.id, runs.length - index]),
	);

	return (
		<div className="flex min-w-0 flex-col gap-4 sm:gap-6">
			<div className="flex min-h-7 items-center justify-start sm:justify-end">
				<select
					value={outcome}
					onChange={(event) => setOutcome(event.target.value)}
					aria-label={t("filterRunOutcomesAriaLabel")}
					className="h-7 rounded-md border bg-muted px-2.5 font-medium text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
				>
					<option value="ALL">{t("runOutcomeAll")}</option>
					<option value="SUCCEEDED">{t("runOutcomeSucceeded")}</option>
					<option value="FAILED">{t("runOutcomeFailed")}</option>
					<option value="RUNNING">{t("runOutcomeRunning")}</option>
					<option value="QUEUED">{t("runOutcomeQueued")}</option>
					<option value="WAITING_FOR_APPROVAL">
						{t("runOutcomeWaitingForApproval")}
					</option>
					<option value="CANCELLED">{t("runOutcomeCancelled")}</option>
				</select>
			</div>

			{visible.map((run) => (
				<div
					key={run.id}
					className="min-w-0 overflow-hidden rounded-lg border bg-card"
				>
					<div className="flex min-w-0 items-stretch">
						<button
							type="button"
							onClick={() =>
								setExpanded((current) => (current === run.id ? null : run.id))
							}
							className="flex min-h-14 w-full min-w-0 flex-col items-stretch gap-3 px-4 py-3 text-left outline-none hover:bg-muted/40 focus-visible:bg-muted/40 sm:flex-row sm:items-center sm:justify-between sm:gap-5 sm:px-5 sm:py-2"
						>
							<span className="min-w-0 flex-1">
								<span className="flex flex-wrap items-center gap-x-3 gap-y-1">
									<span className="font-semibold text-sm">
										{t("runNumberLabel", {
											number: String(runNumbers.get(run.id)).padStart(3, "0"),
										})}
									</span>
									<span
										className={cn(
											"text-muted-foreground text-xs",
											run.status === "FAILED" && "text-destructive",
										)}
									>
										{humanStatus(run.status)}
									</span>
								</span>
								<span className="mt-1 block wrap-break-word font-mono text-muted-foreground text-xs leading-5 sm:mt-0">
									{humanStatus(run.triggerType)} · {formatDate(run.createdAt)}{" "}
									{t("versionSeparator")} {run.version.number}
								</span>
								{run.status === "FAILED" || run.status === "CANCELLED" ? (
									<span className="mt-1.5 flex min-w-0 items-start gap-2 rounded-md bg-destructive/10 px-2.5 py-1.5">
										<Icon
											icon={WarningAlt}
											className="mt-px size-3.5 shrink-0 text-destructive"
										/>
										<span className="min-w-0 wrap-break-word text-destructive text-xs leading-5">
											{runFailureReason(run.errorCode, run.errorMessage)}
										</span>
									</span>
								) : null}
							</span>
							<span className="flex min-w-0 items-center justify-between gap-3 font-mono text-muted-foreground text-xs sm:shrink-0 sm:justify-start sm:gap-4">
								<span>{duration(run.startedAt, run.finishedAt)}</span>
								<span>
									{t("externalActionsCount", { count: run.actions.length })}
								</span>
								<Icon
									icon={expanded === run.id ? ChevronUp : ChevronDown}
									className="size-3.5"
								/>
							</span>
						</button>

						{run.status === "FAILED" || run.status === "CANCELLED" ? (
							<span className="flex shrink-0 items-center pr-4 sm:pr-5">
								<Button
									variant="outline"
									size="sm"
									disabled={retryingRunId === run.id}
									onClick={() => onRetry(run.id)}
								>
									<Icon icon={Renew} data-icon="inline-start" />
									{t("retryButton")}
								</Button>
							</span>
						) : null}

						{run.canCancel ? (
							<span className="flex shrink-0 items-center pr-4 sm:pr-5">
								<Button
									variant="outline"
									size="sm"
									disabled={cancelling}
									onClick={() => setConfirming(run.id)}
								>
									{t("stopButton")}
								</Button>
							</span>
						) : null}
					</div>

					{expanded === run.id ? (
						<ExpandedRun run={run as unknown as RunRow} />
					) : null}
				</div>
			))}

			<AlertDialog
				open={confirming !== null}
				onOpenChange={(open) => setConfirming(open ? confirming : null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t("stopRunConfirmTitle")}</AlertDialogTitle>
						<AlertDialogDescription>
							{t("stopRunConfirmDescription")}
						</AlertDialogDescription>
					</AlertDialogHeader>

					<AlertDialogFooter>
						<AlertDialogCancel>{t("keepRunningButton")}</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							onClick={() => {
								if (confirming) onCancel(confirming);
								setConfirming(null);
							}}
						>
							{t("stopRunConfirmAction")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{visible.length === 0 ? (
				<p className="py-12 text-center text-muted-foreground text-sm">
					{t("noRunsMatchOutcome")}
				</p>
			) : null}
		</div>
	);
}

function ExpandedRun({ run }: { run: RunRow }) {
	const t = useTranslations("agent-panel");
	const timeline = [
		...run.events.map((event) => ({
			kind: "event" as const,
			at: event.emittedAt,
			event,
		})),
		...run.actions.map((action) => ({
			kind: "action" as const,
			at: action.completedAt ?? action.startedAt ?? action.plannedAt,
			action,
		})),
	].sort((first, second) => Date.parse(first.at) - Date.parse(second.at));

	return (
		<div className="min-w-0 border-t">
			<div className="grid grid-cols-2 gap-x-4 gap-y-3 border-b bg-background px-4 py-3 sm:min-h-[58px] sm:grid-cols-4 sm:items-center sm:gap-0 sm:px-5 sm:py-2">
				<RunMeta
					label={t("runMetaTrigger")}
					value={humanStatus(run.triggerType)}
				/>
				<RunMeta
					label={t("runMetaInitiatedBy")}
					value={run.initiatedBy?.name ?? t("eveSchedulerLabel")}
				/>
				<RunMeta
					label={t("runMetaModel")}
					value={run.modelId ?? t("gatewayDefaultLabel")}
				/>
				<RunMeta
					label={t("runMetaVersion")}
					value={String(run.version.number)}
					last
				/>
			</div>

			<div>
				{timeline.map((entry) =>
					entry.kind === "event" ? (
						<div
							key={`event:${entry.event.id}`}
							className="grid min-h-8 min-w-0 grid-cols-[68px_minmax(0,1fr)] items-start gap-x-3 border-t px-4 py-2 first:border-t-0 sm:flex sm:items-center sm:gap-5 sm:px-5 sm:py-1.5"
						>
							<span className="shrink-0 font-mono text-muted-foreground text-xs sm:w-[78px]">
								{formatTime(entry.at)}
							</span>
							<span className="min-w-0 flex-1 wrap-break-word text-sm">
								{eventLabel(entry.event.type, entry.event.data)}
							</span>
							<span className="hidden shrink-0 font-mono text-muted-foreground text-xs sm:inline">
								{t("eventTypeLabel")}
							</span>
						</div>
					) : (
						<div
							key={`action:${entry.action.id}`}
							className="grid min-h-12 min-w-0 grid-cols-[68px_minmax(0,1fr)] items-start gap-x-3 gap-y-1 border-t px-4 py-3 first:border-t-0 sm:flex sm:gap-5 sm:px-5"
						>
							<span className="shrink-0 font-mono text-muted-foreground text-xs sm:w-[78px]">
								{formatTime(entry.at)}
							</span>
							<span className="min-w-0 flex-1">
								<span className="block wrap-break-word text-sm">
									{entry.action.summary}
								</span>
								<span className="block wrap-break-word text-muted-foreground text-xs">
									{entry.action.provider} · {humanStatus(entry.action.status)}
									{entry.action.targetLabel
										? ` · ${entry.action.targetLabel}`
										: ""}
								</span>
							</span>
							<span className="col-start-2 min-w-0 wrap-break-word font-mono text-muted-foreground text-xs sm:col-auto sm:shrink-0">
								{entry.action.externalId ?? entry.action.id.slice(0, 12)}
							</span>
						</div>
					),
				)}
				{run.eventsTruncated ? (
					<div className="flex min-h-9 items-center border-t px-4 py-2 text-warning text-xs sm:px-5">
						{t("showingFirstOfSteps", {
							shown: run.events.length,
							total: run.totalEvents,
						})}
					</div>
				) : null}
			</div>
		</div>
	);
}

function RunMeta({
	label,
	value,
	last = false,
}: {
	label: string;
	value: string;
	last?: boolean;
}) {
	return (
		<span
			className={cn(
				"flex min-w-0 flex-col gap-0.5 sm:flex-1",
				last && "sm:max-w-44",
			)}
		>
			<span className="text-muted-foreground text-xs">{label}</span>
			<span className="wrap-break-word text-sm sm:truncate">{value}</span>
		</span>
	);
}

export function AgentActivity({ activity }: { activity: Activity }) {
	const t = useTranslations("agent-panel");
	const [kind, setKind] = useState("ALL");
	const rows = activity as unknown as ActivityRow[];
	const visible = rows.filter(
		(event) => kind === "ALL" || event.type.startsWith(kind),
	);

	return (
		<div className="flex min-w-0 flex-col gap-4 sm:gap-6">
			<div className="flex min-h-7 flex-wrap items-center justify-start gap-2 sm:justify-end sm:gap-3">
				<select
					value={kind}
					onChange={(event) => setKind(event.target.value)}
					aria-label={t("filterActivityAriaLabel")}
					className="h-7 rounded-md border bg-muted px-2.5 font-medium text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
				>
					<option value="ALL">{t("activityFilterAll")}</option>
					<option value="agent.">{t("activityFilterAgentChanges")}</option>
					<option value="run.">{t("activityFilterRunRequests")}</option>
				</select>
				<Button
					variant="outline"
					size="sm"
					onClick={() => exportJson("agent-activity.json", visible)}
				>
					<Icon icon={Download} data-icon="inline-start" />
					{t("exportButton")}
				</Button>
			</div>

			<div className="min-w-0 overflow-hidden rounded-lg border bg-card">
				<div className="hidden h-9 items-center border-b bg-background px-5 text-muted-foreground text-xs sm:flex">
					<span className="w-[166px] shrink-0">{t("activityColumnTime")}</span>
					<span className="min-w-0 flex-1">{t("activityColumnChange")}</span>
					<span className="w-[140px] shrink-0">{t("activityColumnActor")}</span>
					<span className="w-[118px] shrink-0 text-right">
						{t("activityColumnRequest")}
					</span>
				</div>
				{visible.map((event) => (
					<div
						key={event.id}
						className="flex min-h-11 min-w-0 flex-col items-start gap-2 border-t px-4 py-3 first:border-t-0 sm:flex-row sm:items-center sm:gap-0 sm:px-5"
					>
						<span className="shrink-0 font-mono text-muted-foreground text-xs sm:w-[166px]">
							{formatDate(event.emittedAt)}
						</span>
						<span className="min-w-0 flex-1">
							<span className="block wrap-break-word text-sm">
								{event.summary}
							</span>
							{changeDetail(event.before, event.after) ? (
								<span className="block max-w-full whitespace-pre-wrap wrap-break-word font-mono text-muted-foreground text-xs">
									{changeDetail(event.before, event.after)}
								</span>
							) : null}
						</span>
						<span className="min-w-0 wrap-break-word text-xs sm:w-[140px] sm:shrink-0 sm:text-sm">
							<span className="text-muted-foreground sm:hidden">
								{t("activityActorPrefix")}
							</span>
							{event.actorUser?.name ?? event.actorId ?? event.actorType}
						</span>
						<span className="min-w-0 wrap-break-word font-mono text-muted-foreground text-xs sm:w-[118px] sm:shrink-0 sm:text-right">
							<span className="font-sans sm:hidden">
								{t("activityRequestPrefix")}
							</span>
							{event.requestId?.slice(0, 12) ?? "—"}
						</span>
					</div>
				))}
				{visible.length === 0 ? (
					<p className="px-5 py-12 text-center text-muted-foreground text-sm">
						{t("noChangesMatchFilter")}
					</p>
				) : null}
			</div>
		</div>
	);
}

function recordOf(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function textOf(value: unknown, fallback: string): string {
	return typeof value === "string" && value.trim() ? value : fallback;
}

function humanStatus(value: string): string {
	return value
		.toLowerCase()
		.replace(/_/g, " ")
		.replace(/^./, (character) => character.toUpperCase());
}

function formatDate(value: string): string {
	return DATE_FORMATTER.format(new Date(value));
}

function formatTime(value: string): string {
	return TIME_FORMATTER.format(new Date(value));
}

function duration(startedAt: string | null, finishedAt: string | null): string {
	if (!startedAt) return "—";
	if (!finishedAt) return "In progress";

	const milliseconds =
		new Date(finishedAt).getTime() - new Date(startedAt).getTime();
	return `${Math.max(0, milliseconds / 1000).toFixed(1)}s`;
}

function eventLabel(type: string, data: unknown): string {
	const payload = recordOf(data);
	return textOf(payload.summary, humanStatus(type.replace(/\./g, " ")));
}

function changeDetail(before: unknown, after: unknown): string | null {
	if (!before && !after) return null;
	const previous = JSON.stringify(before);
	const next = JSON.stringify(after);
	return previous && next ? `${previous} → ${next}` : next || previous;
}

function exportJson(name: string, value: unknown) {
	const url = URL.createObjectURL(
		new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
	);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = name;
	anchor.click();
	URL.revokeObjectURL(url);
}
