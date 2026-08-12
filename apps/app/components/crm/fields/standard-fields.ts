import type { FieldEntity } from "./fields-entity";

export const STANDARD_FIELDS: Record<FieldEntity, readonly string[]> = {
	COMPANY: [
		"standardCompanyName",
		"standardCompanyDomain",
		"standardCompanyWebsite",
		"standardCompanyPhone",
		"standardCompanyEmail",
		"standardCompanyCity",
		"standardCompanyCountry",
		"standardCompanyOwner",
	],
	CONTACT: [
		"standardContactFirstName",
		"standardContactLastName",
		"standardContactTitle",
		"standardContactEmail",
		"standardContactPhone",
		"standardContactLinkedin",
		"standardContactGithub",
		"standardContactCompany",
		"standardContactOwner",
	],
	DEAL: [
		"standardDealName",
		"standardDealAmount",
		"standardDealCurrency",
		"standardDealCloseDate",
		"standardDealCompany",
		"standardDealOwner",
		"standardDealStage",
	],
};
