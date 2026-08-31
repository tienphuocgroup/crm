"use client";

import { Alert, AlertDescription, AlertTitle } from "@crm/ui/components/alert";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import {
	Field,
	FieldContent,
	FieldDescription,
	FieldLabel,
} from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import { Progress } from "@crm/ui/components/progress";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { SimpleTable, SimpleTableRow } from "@crm/ui/components/simple-table";
import { Spinner } from "@crm/ui/components/spinner";
import { Switch } from "@crm/ui/components/switch";
import { TableCell } from "@crm/ui/components/table";
import { ToggleGroup, ToggleGroupItem } from "@crm/ui/components/toggle-group";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import Papa from "papaparse";
import { useId, useState } from "react";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import {
	autoMatchColumns,
	type ColumnMapping,
	chunkRows,
	hasRequiredColumn,
	headerTransformer,
	IMPORT_CSV,
	IMPORT_FIELDS,
	type ImportField,
	type ImportKind,
	type ImportRowValues,
	mapRecords,
	problemCsv,
	REQUIRED_FIELD,
	type SplitRows,
	splitRows,
} from "./csv";
import {
	type ImportProblem,
	ImportProblemTable,
	ImportReportBand,
	useImportFieldLabel,
} from "./import-report";

type Step = "upload" | "map" | "dryRun" | "apply" | "done";

type ParsedFile = {
	name: string;
	headers: string[];
	records: Record<string, string>[];
	parseErrors: number;
};

type Report = {
	created: number;
	matchedExisting: number;
	skipped: number;
	errors: Array<{ row: number; field: string; reason: string }>;
	warnings: Array<{ row: number; field: string; reason: string }>;
};

const IGNORE = "ignore";

function emptyReport(): Report {
	return {
		created: 0,
		matchedExisting: 0,
		skipped: 0,
		errors: [],
		warnings: [],
	};
}

function addToReport(into: Report, result: Report): Report {
	return {
		created: into.created + result.created,
		matchedExisting: into.matchedExisting + result.matchedExisting,
		skipped: into.skipped + result.skipped,
		errors: [...into.errors, ...result.errors],
		warnings: [...into.warnings, ...result.warnings],
	};
}

function problemsOf(report: Report): ImportProblem[] {
	return [
		...report.errors.map((issue) => ({
			...issue,
			severity: "error" as const,
		})),
		...report.warnings.map((issue) => ({
			...issue,
			severity: "warning" as const,
		})),
	].sort((left, right) => left.row - right.row);
}

function downloadProblems(problems: ImportProblem[]): void {
	const blob = new Blob([problemCsv(problems)], {
		type: "text/csv;charset=utf-8",
	});
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = "import-problems.csv";
	anchor.click();
	URL.revokeObjectURL(url);
}

export function ImportWizard() {
	const t = useTranslations("settings");
	const trpc = useTRPC();
	const cache = useCrmCache();
	const fieldLabel = useImportFieldLabel();
	const fileId = useId();
	const keylessId = useId();

	const [step, setStep] = useState<Step>("upload");
	const [kind, setKind] = useState<ImportKind>("company");
	const [parsing, setParsing] = useState(false);
	const [fileKey, setFileKey] = useState(0);
	const [parsed, setParsed] = useState<ParsedFile | null>(null);
	const [uploadError, setUploadError] = useState<string | null>(null);
	const [mapping, setMapping] = useState<ColumnMapping[]>([]);
	const [split, setSplit] = useState<SplitRows | null>(null);
	const [includeKeyless, setIncludeKeyless] = useState(false);
	const [running, setRunning] = useState(false);
	const [progress, setProgress] = useState({ done: 0, total: 0 });
	const [report, setReport] = useState<Report | null>(null);
	const [applied, setApplied] = useState<Report | null>(null);
	const [applyResume, setApplyResume] = useState<{
		done: number;
		aggregate: Report;
	} | null>(null);

	const commit = useMutation(trpc.imports.commit.mutationOptions());

	const commitChunk = (
		mode: "dryRun" | "apply",
		include: boolean,
		rows: ImportRowValues[],
	) =>
		kind === "company"
			? commit.mutateAsync({
					kind: "company",
					mode,
					includeKeyless: include,
					rows,
				})
			: commit.mutateAsync({
					kind: "contact",
					mode,
					includeKeyless: include,
					rows,
				});

	const reset = () => {
		setStep("upload");
		setParsing(false);
		setFileKey((key) => key + 1);
		setParsed(null);
		setUploadError(null);
		setMapping([]);
		setSplit(null);
		setIncludeKeyless(false);
		setRunning(false);
		setProgress({ done: 0, total: 0 });
		setReport(null);
		setApplied(null);
		setApplyResume(null);
	};

	const handleFile = (file: File | undefined) => {
		if (!file) return;
		setParsing(true);
		setUploadError(null);
		Papa.parse<Record<string, string>>(file, {
			header: true,
			transformHeader: headerTransformer(),
			skipEmptyLines: "greedy",
			worker: true,
			complete: (results) => {
				setParsing(false);
				const headers = results.meta.fields ?? [];
				if (headers.length === 0 || results.data.length === 0) {
					setUploadError(t("import.emptyFile"));
					return;
				}
				if (results.data.length > IMPORT_CSV.maxRows) {
					setUploadError(
						t("import.tooManyRows", {
							count: results.data.length,
							max: IMPORT_CSV.maxRows,
						}),
					);
					return;
				}
				setParsed({
					name: file.name,
					headers,
					records: results.data,
					parseErrors: results.errors.length,
				});
				setMapping(autoMatchColumns(headers, kind));
				setStep("map");
			},
			error: () => {
				setParsing(false);
				setUploadError(t("import.parseError"));
			},
		});
	};

	const handleKind = (value: string) => {
		if (value !== "company" && value !== "contact") return;
		setKind(value);
		if (parsed) setMapping(autoMatchColumns(parsed.headers, value));
	};

	const handleMapField = (index: number, field: ImportField | null) => {
		setMapping((current) =>
			current.map((column, position) => {
				if (position === index) return { ...column, field };
				if (field && column.field === field) return { ...column, field: null };
				return column;
			}),
		);
	};

	const withClientSkips = (
		aggregate: Report,
		rows: SplitRows,
		include: boolean,
	): Report => ({
		...aggregate,
		skipped:
			aggregate.skipped +
			rows.duplicates.length +
			(include ? 0 : rows.keyless.length),
	});

	const payloadChunks = (rows: SplitRows, include: boolean) =>
		chunkRows(include ? [...rows.unique, ...rows.keyless] : rows.unique);

	const runDryRun = async (rows: SplitRows, include: boolean) => {
		setReport(null);
		setApplyResume(null);
		const chunks = payloadChunks(rows, include);
		setRunning(true);
		setProgress({ done: 0, total: chunks.length });

		let aggregate = emptyReport();
		try {
			for (const chunk of chunks) {
				const result = await commitChunk("dryRun", include, chunk);
				aggregate = addToReport(aggregate, result);
				setProgress((current) => ({ ...current, done: current.done + 1 }));
			}
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
			return;
		} finally {
			setRunning(false);
		}

		setReport(withClientSkips(aggregate, rows, include));
	};

	const startDryRun = () => {
		if (!parsed) return;
		const rows = splitRows(mapRecords(parsed.records, mapping), kind);
		setSplit(rows);
		setStep("dryRun");
		void runDryRun(rows, includeKeyless);
	};

	const handleKeyless = (checked: boolean) => {
		setIncludeKeyless(checked);
		if (split) void runDryRun(split, checked);
	};

	const runApply = async () => {
		if (!split) return;
		setStep("apply");
		const chunks = payloadChunks(split, includeKeyless);
		const start = applyResume?.done ?? 0;
		let aggregate = applyResume?.aggregate ?? emptyReport();
		setRunning(true);
		setProgress({ done: start, total: chunks.length });

		try {
			for (let index = start; index < chunks.length; index += 1) {
				const chunk = chunks[index];
				if (!chunk) break;
				const result = await commitChunk("apply", includeKeyless, chunk);
				aggregate = addToReport(aggregate, result);
				setApplyResume({ done: index + 1, aggregate });
				setProgress({ done: index + 1, total: chunks.length });
			}
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
			return;
		} finally {
			setRunning(false);
		}

		setApplied(withClientSkips(aggregate, split, includeKeyless));
		setApplyResume(null);
		setStep("done");
		void (kind === "company" ? cache.company() : cache.contact());
	};

	const requiredMapped = hasRequiredColumn(mapping, kind);
	const percent =
		progress.total === 0 ? 100 : (progress.done / progress.total) * 100;

	if (step === "upload") {
		return (
			<Card>
				<CardHeader>
					<CardTitle>{t("import.uploadTitle")}</CardTitle>
					<CardDescription>{t("import.uploadDescription")}</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-6">
					<Field>
						<FieldLabel>{t("import.kindLabel")}</FieldLabel>
						<ToggleGroup
							type="single"
							variant="outline"
							value={kind}
							onValueChange={handleKind}
						>
							<ToggleGroupItem value="company">
								{t("import.kindCompany")}
							</ToggleGroupItem>
							<ToggleGroupItem value="contact">
								{t("import.kindContact")}
							</ToggleGroupItem>
						</ToggleGroup>
						<FieldDescription>{t("import.kindHint")}</FieldDescription>
					</Field>
					<Field>
						<FieldLabel htmlFor={fileId}>{t("import.fileLabel")}</FieldLabel>
						<Input
							key={fileKey}
							id={fileId}
							type="file"
							accept=".csv,text/csv"
							disabled={parsing}
							onChange={(event) => handleFile(event.target.files?.[0])}
						/>
						<FieldDescription>
							{t("import.fileHint", { max: IMPORT_CSV.maxRows })}
						</FieldDescription>
					</Field>
					{parsing ? (
						<div className="flex items-center gap-2 text-muted-foreground text-sm">
							<Spinner />
							{t("import.parsing")}
						</div>
					) : null}
					{uploadError ? (
						<Alert variant="destructive">
							<AlertTitle>{t("import.uploadErrorTitle")}</AlertTitle>
							<AlertDescription>{uploadError}</AlertDescription>
						</Alert>
					) : null}
				</CardContent>
			</Card>
		);
	}

	if (step === "map" && parsed) {
		const sample = parsed.records[0] ?? {};

		return (
			<Card>
				<CardHeader>
					<CardTitle>{t("import.mapTitle")}</CardTitle>
					<CardDescription>
						{t("import.mapDescription", { file: parsed.name })}
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					<SimpleTable
						columns={[
							{ id: "column", header: t("import.columnHeader") },
							{ id: "sample", header: t("import.sampleHeader") },
							{ id: "field", header: t("import.fieldHeader"), width: "w-56" },
						]}
					>
						{mapping.map((column, index) => (
							<SimpleTableRow key={column.header}>
								<TableCell className="px-3 py-2 align-middle font-medium">
									{column.header}
								</TableCell>
								<TableCell className="max-w-48 truncate px-3 py-2 align-middle text-muted-foreground">
									{sample[column.header] ?? ""}
								</TableCell>
								<TableCell className="px-3 py-2 align-middle">
									<Select
										value={column.field ?? IGNORE}
										onValueChange={(value) =>
											handleMapField(
												index,
												value === IGNORE ? null : (value as ImportField),
											)
										}
									>
										<SelectTrigger className="w-full">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value={IGNORE}>
												{t("import.ignoreColumn")}
											</SelectItem>
											{IMPORT_FIELDS[kind].map((field) => (
												<SelectItem key={field} value={field}>
													{fieldLabel(field)}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</TableCell>
							</SimpleTableRow>
						))}
					</SimpleTable>
					{parsed.parseErrors > 0 ? (
						<Alert>
							<AlertTitle>{t("import.parseWarningsTitle")}</AlertTitle>
							<AlertDescription>
								{t("import.parseWarnings", { count: parsed.parseErrors })}
							</AlertDescription>
						</Alert>
					) : null}
					{!requiredMapped ? (
						<Alert>
							<AlertTitle>{t("import.requiredMissingTitle")}</AlertTitle>
							<AlertDescription>
								{t("import.requiredMissing", {
									field: fieldLabel(REQUIRED_FIELD[kind]),
								})}
							</AlertDescription>
						</Alert>
					) : null}
					<div className="flex justify-between gap-2">
						<Button variant="outline" onClick={reset}>
							{t("import.backAction")}
						</Button>
						<Button onClick={startDryRun} disabled={!requiredMapped}>
							{t("import.dryRunAction")}
						</Button>
					</div>
				</CardContent>
			</Card>
		);
	}

	if (step === "dryRun" && split) {
		const problems = report ? problemsOf(report) : [];

		return (
			<Card>
				<CardHeader>
					<CardTitle>{t("import.dryRunTitle")}</CardTitle>
					<CardDescription>{t("import.dryRunDescription")}</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					{running ? (
						<div className="flex flex-col gap-2">
							<div className="flex items-center gap-2 text-muted-foreground text-sm">
								<Spinner />
								{t("import.dryRunRunning")}
							</div>
							<Progress value={percent} />
						</div>
					) : null}
					{report ? <ImportReportBand counts={reportCounts(report)} /> : null}
					{report ? (
						<div className="flex flex-col gap-1 text-muted-foreground text-sm">
							<span>
								{t("import.skippedDuplicates", {
									count: split.duplicates.length,
								})}
							</span>
							<span>
								{t(
									kind === "company"
										? "import.skippedKeylessCompanies"
										: "import.skippedKeylessContacts",
									{ count: split.keyless.length },
								)}
							</span>
						</div>
					) : null}
					{split.keyless.length > 0 ? (
						<Field orientation="horizontal">
							<Switch
								id={keylessId}
								checked={includeKeyless}
								disabled={running}
								onCheckedChange={handleKeyless}
							/>
							<FieldContent>
								<FieldLabel htmlFor={keylessId}>
									{t(
										kind === "company"
											? "import.includeKeylessCompanies"
											: "import.includeKeylessContacts",
									)}
								</FieldLabel>
								<FieldDescription>
									{t("import.includeKeylessHint")}
								</FieldDescription>
							</FieldContent>
						</Field>
					) : null}
					{report ? (
						<ImportProblemTable
							problems={problems}
							onDownload={() => downloadProblems(problems)}
						/>
					) : null}
					<div className="flex justify-between gap-2">
						<Button
							variant="outline"
							disabled={running}
							onClick={() => setStep("map")}
						>
							{t("import.backAction")}
						</Button>
						<div className="flex gap-2">
							{!running && !report && split ? (
								<Button
									variant="outline"
									onClick={() => runDryRun(split, includeKeyless)}
								>
									{t("import.retryAction")}
								</Button>
							) : null}
							<Button disabled={running || !report} onClick={runApply}>
								{t("import.applyAction")}
							</Button>
						</div>
					</div>
				</CardContent>
			</Card>
		);
	}

	if (step === "apply") {
		return (
			<Card>
				<CardHeader>
					<CardTitle>{t("import.applyTitle")}</CardTitle>
					<CardDescription>{t("import.applyDescription")}</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					<Progress value={percent} />
					<p className="text-muted-foreground text-sm">
						{t("import.applyProgress", {
							done: progress.done,
							total: progress.total,
						})}
					</p>
					{!running ? (
						<div className="flex justify-end">
							<Button onClick={runApply}>{t("import.retryAction")}</Button>
						</div>
					) : null}
				</CardContent>
			</Card>
		);
	}

	if (step === "done" && applied) {
		const problems = problemsOf(applied);

		return (
			<Card>
				<CardHeader>
					<CardTitle>{t("import.doneTitle")}</CardTitle>
					<CardDescription>{t("import.doneDescription")}</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					<ImportReportBand counts={reportCounts(applied)} />
					<ImportProblemTable
						problems={problems}
						onDownload={() => downloadProblems(problems)}
					/>
					<div className="flex justify-end">
						<Button variant="outline" onClick={reset}>
							{t("import.startOverAction")}
						</Button>
					</div>
				</CardContent>
			</Card>
		);
	}

	return null;
}

function reportCounts(report: Report) {
	return {
		created: report.created,
		matchedExisting: report.matchedExisting,
		skipped: report.skipped,
		errors: report.errors.length,
		warnings: report.warnings.length,
	};
}
