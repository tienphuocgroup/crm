import type { RecordKind } from "@/components/crm/record-sheet/record-stack";
import type { FieldEntity } from "./fields-entity";

const SUBTITLE_KEY: Record<RecordKind, string> = {
	company: "fields.subtitleCompany",
	contact: "fields.subtitleContact",
	deal: "fields.subtitleDeal",
};

export function subtitleKey(kind: RecordKind): string {
	return SUBTITLE_KEY[kind];
}

const SHEET_PLACEMENT_KEY: Record<FieldEntity, string> = {
	COMPANY: "fields.sheetPlacementCompany",
	CONTACT: "fields.sheetPlacementContact",
	DEAL: "fields.sheetPlacementDeal",
};

const TABLE_PLACEMENT_KEY: Record<FieldEntity, string> = {
	COMPANY: "fields.tablePlacementCompany",
	CONTACT: "fields.tablePlacementContact",
	DEAL: "fields.tablePlacementDeal",
};

export function sheetPlacementKey(entity: FieldEntity): string {
	return SHEET_PLACEMENT_KEY[entity];
}

export function tablePlacementKey(entity: FieldEntity): string {
	return TABLE_PLACEMENT_KEY[entity];
}

export const ENTITY_TABS = [
	{ kind: "company", key: "fields.companiesTab" },
	{ kind: "contact", key: "fields.contactsTab" },
	{ kind: "deal", key: "fields.dealsTab" },
] as const satisfies readonly { kind: RecordKind; key: string }[];
