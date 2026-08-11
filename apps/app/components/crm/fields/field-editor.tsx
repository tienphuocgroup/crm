"use client";

import Add from "@carbon/icons-react/es/Add";
import Close from "@carbon/icons-react/es/Close";
import {
	FIELD_TYPES,
	fieldKeyFromLabel,
	typeLabel,
} from "@crm/db/fields-shape";
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
import { Checkbox } from "@crm/ui/components/checkbox";
import {
	Field,
	FieldDescription,
	FieldLabel,
	FieldTitle,
} from "@crm/ui/components/field";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { SortableItem, SortableList } from "@crm/ui/components/sortable-list";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { Switch } from "@crm/ui/components/switch";
import { Textarea } from "@crm/ui/components/textarea";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { sheetPlacementKey, tablePlacementKey } from "./fields-copy";
import { type FieldEntity, kindOf } from "./fields-entity";

const COVERAGE_NOUN_KEY: Record<FieldEntity, string> = {
	COMPANY: "fields.nounCompanies",
	CONTACT: "fields.nounContacts",
	DEAL: "fields.nounDeals",
};

type FieldRecord = RouterOutputs["fields"]["list"][number];

type Draft = {
	label: string;
	type: (typeof FIELD_TYPES)[number];
	options: { id?: string; label: string }[];
	agentFilled: boolean;
	agentBrief: string;
	showOnSheet: boolean;
	showOnTable: boolean;
};

const TYPE_HINT_KEY: Record<string, string> = {
	TEXT: "fields.typeHintText",
	LONG_TEXT: "fields.typeHintLongText",
	NUMBER: "fields.typeHintNumber",
	DATE: "fields.typeHintDate",
	CHECKBOX: "fields.typeHintCheckbox",
	SELECT: "fields.typeHintSelect",
	URL: "fields.typeHintUrl",
	EMAIL: "fields.typeHintEmail",
	PHONE: "fields.typeHintPhone",
	USER: "fields.typeHintUser",
};

function optionId(option: { id?: string }, index: number): string {
	return option.id ?? `draft-${index}`;
}

const SECTION = "flex flex-col gap-4 border-b px-5 py-4";

function draftFrom(field: FieldRecord | undefined): Draft {
	return {
		label: field?.label ?? "",
		type: field?.type ?? "TEXT",
		options:
			field?.options.map((option) => ({
				id: option.id,
				label: option.label,
			})) ?? [],
		agentFilled: field?.agentFilled ?? true,
		agentBrief: field?.agentBrief ?? "",
		showOnSheet: field?.showOnSheet ?? true,
		showOnTable: field?.showOnTable ?? false,
	};
}

function Coverage({ field }: { field: FieldRecord }) {
	const common = useTranslations("common");
	const trpc = useTRPC();
	const cache = useCrmCache();
	const coverage = useQuery(
		trpc.fields.coverage.queryOptions({ id: field.id }),
	);

	const backfill = useMutation(
		trpc.fields.backfill.mutationOptions({
			onSuccess: async () => {
				toast.success(common("fields.backfillToast"));
				await cache.fieldCoverage(field.id);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (!field.agentFilled || !coverage.data) return null;

	const { filled, total } = coverage.data;
	const noun = common(COVERAGE_NOUN_KEY[field.entity as FieldEntity]);
	const covered = filled >= total;

	return (
		<div className="shrink-0 border-t px-5 py-3">
			<div className="flex items-center gap-3 rounded-md bg-muted p-3">
				<div className="flex min-w-0 flex-1 flex-col gap-0.5">
					<StatusIndicator
						tone="primary"
						className="font-medium text-foreground"
						label={common("fields.filledCount", { filled, total, noun })}
					/>
					<span className="pl-4 text-muted-foreground text-xs">
						{covered
							? common("fields.allFilled")
							: common("fields.stillToGo", { count: total - filled })}
					</span>
				</div>
				<Button
					variant="outline"
					size="sm"
					disabled={backfill.isPending || covered}
					onClick={() => backfill.mutate({ id: field.id })}
				>
					{common("fields.fillRest")}
				</Button>
			</div>
		</div>
	);
}

export function FieldEditor({
	entity,
	field,
	onDone,
}: {
	entity: FieldEntity;
	field: FieldRecord | undefined;
	onDone: () => void;
}) {
	const common = useTranslations("common");
	const trpc = useTRPC();
	const cache = useCrmCache();
	const labelId = useId();
	const briefId = useId();
	const agentId = useId();
	const typeId = useId();
	const optionsId = useId();

	const [draft, setDraft] = useState<Draft>(() => draftFrom(field));
	const [confirming, setConfirming] = useState(false);

	const patch = (next: Partial<Draft>) =>
		setDraft((current) => ({ ...current, ...next }));

	const settle = async () => {
		await cache.fields(kindOf(entity));
		onDone();
	};

	const create = useMutation(
		trpc.fields.create.mutationOptions({
			onSuccess: settle,
			onError: (error) => toast.error(error.message),
		}),
	);

	const update = useMutation(
		trpc.fields.update.mutationOptions({
			onSuccess: settle,
			onError: (error) => toast.error(error.message),
		}),
	);

	const archive = useMutation(
		trpc.fields.archive.mutationOptions({
			onSuccess: settle,
			onError: (error) => toast.error(error.message),
		}),
	);

	const key = field?.key ?? fieldKeyFromLabel(draft.label);
	const saving = create.isPending || update.isPending;

	const save = () => {
		const payload = {
			label: draft.label,
			type: draft.type,
			options: draft.options.filter((option) => option.label.trim() !== ""),
			agentFilled: draft.agentFilled,
			agentBrief: draft.agentBrief.trim() || null,
			showOnSheet: draft.showOnSheet,
			showOnTable: draft.showOnTable,
		};

		if (field) {
			update.mutate({ id: field.id, data: payload });
			return;
		}

		create.mutate({ ...payload, entity, required: false });
	};

	return (
		<>
			<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
				<div className={SECTION}>
					<Field>
						<FieldLabel htmlFor={labelId}>
							{common("fields.labelLabel")}
						</FieldLabel>
						<Input
							id={labelId}
							value={draft.label}
							onChange={(event) => patch({ label: event.target.value })}
						/>
					</Field>

					<Field>
						<div className="flex items-baseline justify-between gap-2">
							<FieldTitle>{common("fields.keyLabel")}</FieldTitle>
							<span className="font-mono text-muted-foreground text-xs">
								{key || "—"}
							</span>
						</div>
						<FieldDescription>{common("fields.keyHelp")}</FieldDescription>
					</Field>
				</div>

				<div className={SECTION}>
					<Field orientation="horizontal">
						<div className="flex min-w-0 flex-1 flex-col gap-0.5">
							<FieldLabel htmlFor={agentId}>
								{common("fields.agentLabel")}
							</FieldLabel>
							<FieldDescription>{common("fields.agentHelp")}</FieldDescription>
						</div>
						<Switch
							id={agentId}
							checked={draft.agentFilled}
							onCheckedChange={(agentFilled) => patch({ agentFilled })}
						/>
					</Field>

					<Field>
						<FieldLabel htmlFor={briefId}>
							{common("fields.briefLabel")}
						</FieldLabel>
						<Textarea
							id={briefId}
							rows={3}
							value={draft.agentBrief}
							onChange={(event) => patch({ agentBrief: event.target.value })}
						/>
						<FieldDescription>{common("fields.briefHelp")}</FieldDescription>
					</Field>
				</div>

				<div className={SECTION}>
					<Field>
						<FieldLabel htmlFor={typeId}>
							{common("fields.typeLabel")}
						</FieldLabel>
						<Select
							value={draft.type}
							onValueChange={(value) => patch({ type: value as Draft["type"] })}
						>
							<SelectTrigger id={typeId} className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{FIELD_TYPES.map((type) => (
									<SelectItem key={type} value={type}>
										{TYPE_HINT_KEY[type]
											? common(TYPE_HINT_KEY[type])
											: typeLabel(type)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Field>

					{draft.type === "SELECT" ? (
						<Field aria-labelledby={optionsId}>
							<FieldTitle id={optionsId}>
								{common("fields.optionsLabel")}
							</FieldTitle>
							<SortableList
								ids={draft.options.map(optionId)}
								onReorder={(ids) =>
									patch({
										options: ids
											.map((id) =>
												draft.options.find(
													(option, at) => optionId(option, at) === id,
												),
											)
											.filter((option): option is Draft["options"][number] =>
												Boolean(option),
											),
									})
								}
							>
								<div className="flex flex-col gap-1.5">
									{draft.options.map((option, index) => (
										<SortableItem
											key={optionId(option, index)}
											id={optionId(option, index)}
											label={option.label || "option"}
										>
											<Input
												aria-label={common("fields.optionLabel", {
													number: index + 1,
												})}
												value={option.label}
												onChange={(event) =>
													patch({
														options: draft.options.map((entry, at) =>
															at === index
																? { ...entry, label: event.target.value }
																: entry,
														),
													})
												}
											/>
											<Button
												variant="ghost"
												size="icon-xs"
												onClick={() =>
													patch({
														options: draft.options.filter(
															(_, at) => at !== index,
														),
													})
												}
											>
												<Icon icon={Close} />
												<span className="sr-only">
													{common("fields.optionSrRemove", {
														option: common("fields.optionLabel", {
															number: index + 1,
														}),
													})}
												</span>
											</Button>
										</SortableItem>
									))}
								</div>
							</SortableList>
							<Button
								variant="ghost"
								size="sm"
								className="self-start"
								onClick={() =>
									patch({ options: [...draft.options, { label: "" }] })
								}
							>
								<Icon icon={Add} data-icon="inline-start" />
								{common("fields.addOption")}
							</Button>
						</Field>
					) : null}
				</div>

				<div className="flex flex-col gap-2.5 border-b px-5 py-4">
					<FieldLabel className="items-center gap-2 font-normal">
						<Checkbox
							checked={draft.showOnSheet}
							onCheckedChange={(checked) =>
								patch({ showOnSheet: checked === true })
							}
						/>
						{common(sheetPlacementKey(entity))}
					</FieldLabel>
					<FieldLabel className="items-center gap-2 font-normal">
						<Checkbox
							checked={draft.showOnTable}
							onCheckedChange={(checked) =>
								patch({ showOnTable: checked === true })
							}
						/>
						{common(tablePlacementKey(entity))}
					</FieldLabel>
				</div>
			</div>

			{field ? <Coverage field={field} /> : null}

			<div className="flex shrink-0 items-center gap-2 border-t px-5 py-3">
				<Button disabled={saving || draft.label.trim() === ""} onClick={save}>
					{field ? common("fields.saveChanges") : common("fields.addField")}
				</Button>
				{field ? (
					<Button variant="outline" onClick={() => setConfirming(true)}>
						{common("fields.archive")}
					</Button>
				) : (
					<Button variant="outline" onClick={onDone}>
						{common("cancel")}
					</Button>
				)}
			</div>

			{field ? (
				<AlertDialog open={confirming} onOpenChange={setConfirming}>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>
								{common("fields.archiveFieldConfirmTitle", {
									label: field.label,
								})}
							</AlertDialogTitle>
							<AlertDialogDescription>
								{common("fields.archiveFieldConfirmDescription")}
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>{common("cancel")}</AlertDialogCancel>
							<AlertDialogAction
								variant="destructive"
								onClick={() => archive.mutate({ id: field.id })}
							>
								{common("fields.archiveFieldAction")}
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			) : null}
		</>
	);
}
