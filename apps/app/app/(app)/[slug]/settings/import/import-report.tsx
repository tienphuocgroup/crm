"use client";

import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import { SimpleTable, SimpleTableRow } from "@crm/ui/components/simple-table";
import { TableCell } from "@crm/ui/components/table";
import { useTranslations } from "next-intl";
import { IMPORT_CSV } from "./csv";

export type ImportReportCounts = {
	created: number;
	matchedExisting: number;
	skipped: number;
	errors: number;
	warnings: number;
};

export type ImportProblem = {
	row: number;
	severity: "error" | "warning";
	field: string;
	reason: string;
};

const FIELD_LABEL_KEY: Record<string, string> = {
	name: "import.fieldName",
	domain: "import.fieldDomain",
	website: "import.fieldWebsite",
	industry: "import.fieldIndustry",
	city: "import.fieldCity",
	country: "import.fieldCountry",
	phone: "import.fieldPhone",
	email: "import.fieldEmail",
	linkedinUrl: "import.fieldLinkedinUrl",
	firstName: "import.fieldFirstName",
	lastName: "import.fieldLastName",
	title: "import.fieldTitle",
	companyDomain: "import.fieldCompanyDomain",
	companyName: "import.fieldCompanyName",
};

const REASON_LABEL_KEY: Record<string, string> = {
	required: "import.reasonRequired",
	invalid: "import.reasonInvalid",
	companyNotFound: "import.reasonCompanyNotFound",
};

export function useImportFieldLabel(): (field: string) => string {
	const t = useTranslations("settings");
	return (field) => {
		const key = FIELD_LABEL_KEY[field];
		return key ? t(key) : field;
	};
}

const CELL = "px-3 py-2 align-middle";

function reasonLabel(
	t: ReturnType<typeof useTranslations>,
	reason: string,
): string {
	const key = REASON_LABEL_KEY[reason];
	return key ? t(key) : reason;
}

function Count({ label, value }: { label: string; value: number }) {
	return (
		<div className="flex flex-col gap-0.5">
			<span className="font-semibold text-2xl tabular-nums">{value}</span>
			<span className="text-muted-foreground text-sm">{label}</span>
		</div>
	);
}

export function ImportReportBand({ counts }: { counts: ImportReportCounts }) {
	const t = useTranslations("settings");

	return (
		<div className="flex flex-wrap gap-x-10 gap-y-4 rounded-lg border bg-card p-4">
			<Count label={t("import.countCreated")} value={counts.created} />
			<Count label={t("import.countMatched")} value={counts.matchedExisting} />
			<Count label={t("import.countSkipped")} value={counts.skipped} />
			<Count label={t("import.countErrors")} value={counts.errors} />
			<Count label={t("import.countWarnings")} value={counts.warnings} />
		</div>
	);
}

export function ImportProblemTable({
	problems,
	onDownload,
}: {
	problems: ImportProblem[];
	onDownload: () => void;
}) {
	const t = useTranslations("settings");
	const fieldLabel = useImportFieldLabel();

	if (problems.length === 0) return null;

	const rendered = problems.slice(0, IMPORT_CSV.renderedProblemRows);

	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<h3 className="font-medium text-sm">
					{t("import.problemsTitle", { count: problems.length })}
				</h3>
				<Button variant="outline" size="sm" onClick={onDownload}>
					{t("import.downloadProblems")}
				</Button>
			</div>
			{problems.length > rendered.length ? (
				<p className="text-muted-foreground text-sm">
					{t("import.problemsTruncated", {
						shown: rendered.length,
						total: problems.length,
					})}
				</p>
			) : null}
			<SimpleTable
				columns={[
					{ id: "row", header: t("import.problemRow"), width: "w-20" },
					{
						id: "severity",
						header: t("import.problemSeverity"),
						width: "w-28",
					},
					{ id: "field", header: t("import.problemField"), width: "w-44" },
					{ id: "reason", header: t("import.problemReason") },
				]}
			>
				{rendered.map((problem) => (
					<SimpleTableRow key={`${problem.row}-${problem.field}`}>
						<TableCell className={CELL}>{problem.row}</TableCell>
						<TableCell className={CELL}>
							<Badge
								variant={
									problem.severity === "error" ? "destructive" : "secondary"
								}
							>
								{problem.severity === "error"
									? t("import.severityError")
									: t("import.severityWarning")}
							</Badge>
						</TableCell>
						<TableCell className={CELL}>{fieldLabel(problem.field)}</TableCell>
						<TableCell className={CELL}>
							{reasonLabel(t, problem.reason)}
						</TableCell>
					</SimpleTableRow>
				))}
			</SimpleTable>
		</div>
	);
}
