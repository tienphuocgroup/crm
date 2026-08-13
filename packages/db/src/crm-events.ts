export type CrmEventRecordKind = "company" | "contact" | "deal";

type CrmEventDefinition = {
	label: string;
	description: string;
	recordKind: CrmEventRecordKind;
};

export const CRM_EVENT_CATALOG = {
	"company.created": {
		label: "Organization created",
		description: "An organization is added to the CRM",
		recordKind: "company",
	},
	"contact.created": {
		label: "Client created",
		description: "A client is added to the CRM",
		recordKind: "contact",
	},
	"deal.created": {
		label: "Journey created",
		description: "A journey is added to the CRM",
		recordKind: "deal",
	},
	"deal.stage.changed": {
		label: "Journey stage changed",
		description: "A journey moves from one pipeline stage to another",
		recordKind: "deal",
	},
	"deal.opened": {
		label: "Journey opened",
		description: "A closed journey returns to the open pipeline",
		recordKind: "deal",
	},
	"deal.closed": {
		label: "Journey closed",
		description: "An open journey moves to a closed stage",
		recordKind: "deal",
	},
} as const satisfies Record<string, CrmEventDefinition>;

export type CrmEventType = keyof typeof CRM_EVENT_CATALOG;

export const CRM_EVENT_TYPES = Object.keys(CRM_EVENT_CATALOG) as [
	CrmEventType,
	...CrmEventType[],
];

export function isCrmEventType(value: unknown): value is CrmEventType {
	return typeof value === "string" && Object.hasOwn(CRM_EVENT_CATALOG, value);
}
