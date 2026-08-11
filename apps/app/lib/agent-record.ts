import type { CarbonIcon } from "@crm/ui/components/icon";

export type AgentRecordKind = "contact" | "company" | "deal";

export type AgentRecord = { kind: AgentRecordKind; id: string };

type RecordProtocol = {
	header: string;
	field: "contactId" | "companyId" | "dealId";
};

const PROTOCOL: Record<AgentRecordKind, RecordProtocol> = {
	contact: { header: "x-crm-contact", field: "contactId" },
	company: { header: "x-crm-company", field: "companyId" },
	deal: { header: "x-crm-deal", field: "dealId" },
};

export type RecordCopyKeys = {
	title: string;
	blurb: string;
	placeholder: string;
	suggestions: readonly string[];
};

const COPY_KEYS: Record<AgentRecordKind, RecordCopyKeys> = {
	contact: {
		title: "recordContactTitle",
		blurb: "recordContactBlurb",
		placeholder: "recordContactPlaceholder",
		suggestions: [
			"recordContactSuggestionWho",
			"recordContactSuggestionStillThere",
			"recordContactSuggestionBeforeCall",
		],
	},
	company: {
		title: "recordCompanyTitle",
		blurb: "recordCompanyBlurb",
		placeholder: "recordCompanyPlaceholder",
		suggestions: [
			"recordCompanySuggestionWhatTheyDo",
			"recordCompanySuggestionWhoWeKnow",
			"recordCompanySuggestionWhatChanged",
		],
	},
	deal: {
		title: "recordDealTitle",
		blurb: "recordDealBlurb",
		placeholder: "recordDealPlaceholder",
		suggestions: [
			"recordDealSuggestionWhereItStands",
			"recordDealSuggestionWhoElse",
			"recordDealSuggestionRisk",
		],
	},
};

export function recordCopyKeys(kind: AgentRecordKind): RecordCopyKeys {
	return COPY_KEYS[kind];
}

export function recordHeader(record: AgentRecord): Record<string, string> {
	return { [PROTOCOL[record.kind].header]: record.id };
}

export function recordFilter(record: AgentRecord): {
	contactId?: string;
	companyId?: string;
	dealId?: string;
} {
	return { [PROTOCOL[record.kind].field]: record.id };
}

export type { CarbonIcon };
