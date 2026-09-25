import type { RecordKind } from "@/components/crm/record-sheet/record-stack";
import type { FieldEntity } from "./fields-entity";

const SUBTITLE_KEY = {
	company: "fields.subtitleCompany",
	contact: "fields.subtitleContact",
	deal: "fields.subtitleDeal",
} satisfies Record<RecordKind, string>;

export function subtitleKey(kind: RecordKind): string {
	return SUBTITLE_KEY[kind];
}

const SHEET_PLACEMENT_KEY = {
	COMPANY: "fields.sheetPlacementCompany",
	CONTACT: "fields.sheetPlacementContact",
	DEAL: "fields.sheetPlacementDeal",
} satisfies Record<FieldEntity, string>;

const TABLE_PLACEMENT_KEY = {
	COMPANY: "fields.tablePlacementCompany",
	CONTACT: "fields.tablePlacementContact",
	DEAL: "fields.tablePlacementDeal",
} satisfies Record<FieldEntity, string>;

const FILTER_PLACEMENT_KEY = {
	COMPANY: "fields.filterPlacementCompany",
	CONTACT: "fields.filterPlacementContact",
	DEAL: "fields.filterPlacementDeal",
} satisfies Record<FieldEntity, string>;

export function sheetPlacementKey(entity: FieldEntity): string {
	return SHEET_PLACEMENT_KEY[entity];
}

export function tablePlacementKey(entity: FieldEntity): string {
	return TABLE_PLACEMENT_KEY[entity];
}

export function filterPlacementKey(entity: FieldEntity): string {
	return FILTER_PLACEMENT_KEY[entity];
}

export const ENTITY_TABS = [
	{ kind: "company", key: "fields.companiesTab" },
	{ kind: "contact", key: "fields.contactsTab" },
	{ kind: "deal", key: "fields.dealsTab" },
] as const satisfies readonly { kind: RecordKind; key: string }[];
