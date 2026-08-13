import { mirror } from "../src/blob";
import { db } from "../src/client";
import { DEFAULT_REPORTING_CURRENCY } from "../src/currency";
import { OPEN_DEAL_STAGES } from "../src/deal-stage";
import { resolveFavicon } from "../src/favicon";
import {
	ActivityType,
	DealStage,
	RateSource,
} from "../src/generated/prisma/enums";
import { readReportingCurrency, SETTINGS_ID } from "../src/settings";

function makeRandom(seed: number): () => number {
	let a = seed;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const random = makeRandom(20260731);

function pick<T>(items: readonly T[]): T {
	const item = items[Math.floor(random() * items.length)];
	if (item === undefined) throw new Error("pick() on an empty list");
	return item;
}

function chance(probability: number): boolean {
	return random() < probability;
}

function integer(min: number, max: number): number {
	return min + Math.floor(random() * (max - min + 1));
}

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.now();

function daysFromNow(days: number, jitterHours = 0): Date {
	const jitter = jitterHours
		? (random() - 0.5) * jitterHours * 60 * 60 * 1000
		: 0;
	return new Date(NOW + days * DAY_MS + jitter);
}

const OWNERS = [
	{ name: "Dr. Khoa Tran", email: "khoa.tran@lotusbayhealth.com" },
	{ name: "Mai Nguyen", email: "mai.nguyen@lotusbayhealth.com" },
	{ name: "Elena Marquez", email: "elena.marquez@lotusbayhealth.com" },
] as const;

type SeedCompany = {
	name: string;
	domain: string;
	industry: string;
	city: string;
	country: string;
	countryCode: string;
	clients: number;
	journeys: number;
};

const COMPANIES: readonly SeedCompany[] = [
	{
		name: "Truong Son Logistics",
		domain: "truongsonlogistics.com",
		industry: "Logistics",
		city: "Ho Chi Minh City",
		country: "Vietnam",
		countryCode: "VN",
		clients: 3,
		journeys: 2,
	},
	{
		name: "Helios Semiconductor",
		domain: "heliossemi.sg",
		industry: "Semiconductors",
		city: "Singapore",
		country: "Singapore",
		countryCode: "SG",
		clients: 3,
		journeys: 2,
	},
	{
		name: "Cavendish Grant",
		domain: "cavendishgrant.co.uk",
		industry: "Legal Services",
		city: "London",
		country: "United Kingdom",
		countryCode: "GB",
		clients: 2,
		journeys: 1,
	},
	{
		name: "Pacifica Health Assurance",
		domain: "pacificahealth.com",
		industry: "Insurance",
		city: "Hong Kong",
		country: "Hong Kong",
		countryCode: "HK",
		clients: 2,
		journeys: 2,
	},
	{
		name: "An Tam Family Clinic",
		domain: "antamclinic.vn",
		industry: "Primary Care",
		city: "Hanoi",
		country: "Vietnam",
		countryCode: "VN",
		clients: 0,
		journeys: 0,
	},
	{
		name: "Marina Sports Medicine",
		domain: "marinasportsmed.com",
		industry: "Sports Medicine",
		city: "Singapore",
		country: "Singapore",
		countryCode: "SG",
		clients: 0,
		journeys: 0,
	},
];

const STANDALONE_CLIENTS = 18;

const VI_FIRST_NAMES = [
	{ name: "Minh Anh", female: true },
	{ name: "Thu Hà", female: true },
	{ name: "Quốc Bảo", female: false },
	{ name: "Ngọc Lan", female: true },
	{ name: "Hải Đăng", female: false },
	{ name: "Phương Vy", female: true },
	{ name: "Tuấn Kiệt", female: false },
	{ name: "Bảo Châu", female: true },
	{ name: "Gia Hân", female: true },
	{ name: "Đức Anh", female: false },
	{ name: "Khánh Linh", female: true },
	{ name: "Trọng Nghĩa", female: false },
] as const;

const VI_LAST_NAMES = [
	"Nguyễn",
	"Trần",
	"Lê",
	"Phạm",
	"Vũ",
	"Đặng",
	"Bùi",
	"Hoàng",
	"Ngô",
	"Đỗ",
] as const;

const INTL_FIRST_NAMES = [
	{ name: "Amara", female: true },
	{ name: "Daniel", female: false },
	{ name: "Elena", female: true },
	{ name: "Farah", female: true },
	{ name: "Hana", female: true },
	{ name: "Ines", female: true },
	{ name: "Jonas", female: false },
	{ name: "Mateo", female: false },
	{ name: "Nadia", female: true },
	{ name: "Rosa", female: true },
	{ name: "Wes", female: false },
	{ name: "Yuki", female: true },
] as const;

const INTL_LAST_NAMES = [
	"Adeyemi",
	"Bergström",
	"Chen",
	"Dubois",
	"Gupta",
	"Haddad",
	"Lombardi",
	"Nakamura",
	"Rossi",
	"Sørensen",
	"Tan",
	"Whitfield",
] as const;

const PERSONAL_EMAIL_DOMAINS = [
	"gmail.com",
	"gmail.com",
	"outlook.com",
	"icloud.com",
	"yahoo.com",
] as const;

const CLIENT_NOTES = [
	"Self-referred — website",
	"Referred by An Tam Family Clinic",
	"Referred by Marina Sports Medicine",
	"Referred by a member",
	"Returning client",
	"Walk-in — Saturday clinic",
	"Prefers evening appointments",
	"Prefers messages, not calls",
	"Prefers email only",
	"Insurance claim on every visit",
] as const;

const PROGRAMS = [
	"Longevity program",
	"Executive health screening",
	"Physiotherapy package",
	"IV therapy series",
	"Annual membership",
	"Prenatal care plan",
	"Sleep clinic program",
	"Weight management program",
] as const;

const PRENATAL_PROGRAM = "Prenatal care plan";

const PROGRAMS_WITHOUT_PRENATAL = PROGRAMS.filter(
	(program) => program !== PRENATAL_PROGRAM,
);

const ORG_PROGRAMS = [
	"Executive health screening",
	"Annual membership plan",
	"Longevity program cohort",
	"Onsite physiotherapy package",
] as const;

const DEAL_DESCRIPTIONS = [
	"Came in for one screening and asked about the full longevity program. Wants the results review before she commits.",
	"Physiotherapy after a knee injury. Twelve sessions, and she wants them finished before the marathon.",
	"Executive screening booked by a member who now wants the same plan for his wife.",
	"Sleep clinic referral from An Tam. Two nights of monitoring, then a care plan.",
	"Prenatal plan from the second trimester. She asks about the birth partner package at every visit.",
	"IV therapy series after the first consult. Payment plan is the open question.",
	"Weight management program with monthly reviews. The insurer covers part of it.",
	"Annual membership renewal. He wants the same coordinator and the same evening slots.",
] as const;

const ORG_DEAL_DESCRIPTIONS = [
	"Corporate wellness renewal for the leadership team. HR wants one invoice per quarter.",
	"Onsite screening days for two cohorts, then individual results reviews at the clinic.",
	"Their broker asks for a program the staff can read in one page. Benefits lead decides.",
	"Member cohort from the insurer. Pre-authorisation runs through their claims team.",
] as const;

const ORG_CONTACT_ROLES = [
	"Program sponsor",
	"Benefits lead",
	"Enrolled member",
] as const;

const LOST_REASONS = [
	"Chose a clinic closer to home",
	"Cost — the insurer covers none of the program",
	"Postponed care until after the relocation",
	"Stayed with their own physician",
	"No answer after two consult reminders",
] as const;

const NOTE_BODIES = [
	"Consult ran long. She wants the full screening panel before she decides on the membership.",
	"Asked whether the insurer covers the imaging. Waiting on Pacifica to confirm.",
	"Missed the first consult. Rebooked for the evening clinic — nothing before 18:00.",
	"Her husband joins the next visit. He decides on the family plan.",
	"Wants the physiotherapy block finished before the marathon in March.",
	"Referred by An Tam Family Clinic. The records arrive by email this week.",
	"Pre-op instructions read back to him on the call. He repeats the fasting window correctly.",
	"Renewal conversation started early. She asks for the same coordinator.",
] as const;

const ORG_NOTE_BODIES = [
	"HR wants one invoice per quarter, not one per employee.",
	"Their broker asks for a screening summary the staff can read.",
	"Onsite day booked for the first cohort. Rooms are confirmed.",
	"They send referrals every month. Keep the coordinator on the thread.",
] as const;

const CALL_SUBJECTS = [
	"First consult call",
	"Program follow-up",
	"Insurance cover question",
	"Rebooking after a no-show",
	"Membership renewal call",
] as const;

const TASK_SUBJECTS = [
	"Send the pre-consult questionnaire",
	"Share the program quote",
	"Book the screening slot",
	"Chase the insurance pre-authorisation",
	"Send the pre-op instructions",
	"Call after the missed appointment",
	"Introduce the care coordinator",
] as const;

const MEETING_SUBJECTS = [
	"First consult",
	"Results review",
	"Care plan walkthrough",
	"Renewal review",
] as const;

const EMAIL_SUBJECTS = [
	"Re: your consult on Thursday",
	"Your screening results are ready",
	"Program pricing and payment plan",
	"Pre-op instructions for next week",
] as const;

const TRANSLITERATIONS: Record<string, string> = {
	ø: "o",
	æ: "ae",
	œ: "oe",
	å: "a",
	ß: "ss",
	đ: "d",
	ł: "l",
	þ: "th",
	ư: "u",
	ơ: "o",
};

function slug(value: string): string {
	return value
		.toLowerCase()
		.replace(/[øæœåßđłþươ]/g, (char) => TRANSLITERATIONS[char] ?? char)
		.normalize("NFD")
		.replace(/\p{Mn}/gu, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}

function mailbox(value: string): string {
	return slug(value).replace(/-/g, "");
}

function clientName(): {
	firstName: string;
	lastName: string;
	female: boolean;
} {
	const vietnamese = chance(0.6);
	const first = vietnamese ? pick(VI_FIRST_NAMES) : pick(INTL_FIRST_NAMES);
	const lastName = vietnamese ? pick(VI_LAST_NAMES) : pick(INTL_LAST_NAMES);
	return { firstName: first.name, lastName, female: first.female };
}

async function seedOwners(): Promise<string[]> {
	const existing = await db.user.findMany({ select: { id: true } });

	if (existing.length > 0) {
		console.log(`Using ${existing.length} existing user(s) as owners.`);
		return existing.map((user) => user.id);
	}

	console.log("No users yet — creating placeholder clinic staff.");
	const created = await Promise.all(
		OWNERS.map((owner) =>
			db.user.upsert({
				where: { email: owner.email },
				create: {
					id: `seed-${slug(owner.name)}`,
					name: owner.name,
					email: owner.email,
					emailVerified: true,
					updatedAt: new Date(),
				},
				update: {},
				select: { id: true },
			}),
		),
	);

	return created.map((user) => user.id);
}

type SeededCompany = {
	id: string;
	name: string;
	clients: number;
	journeys: number;
};

async function seedCompanies(ownerIds: string[]): Promise<SeededCompany[]> {
	const companies = [];

	for (const company of COMPANIES) {
		const row = await db.company.upsert({
			where: { domain: company.domain },
			create: {
				name: company.name,
				domain: company.domain,
				website: `https://${company.domain}`,
				industry: company.industry,
				city: company.city,
				country: company.country,
				countryCode: company.countryCode,
				ownerId: pick(ownerIds),
				createdAt: daysFromNow(-integer(30, 400), 12),
			},
			update: {},
			select: { id: true, name: true, domain: true, iconUrl: true },
		});
		companies.push({
			...row,
			domain: row.domain ?? company.domain,
			clients: company.clients,
			journeys: company.journeys,
		});
	}

	await seedIcons(companies);

	return companies.map(
		({ iconUrl: _icon, domain: _domain, ...company }) => company,
	);
}

async function seedIcons(
	companies: { id: string; domain: string | null; iconUrl: string | null }[],
): Promise<void> {
	const missing = companies.filter(
		(company) => company.iconUrl === null && company.domain,
	);
	if (missing.length === 0) return;

	let resolved = 0;
	for (const company of missing) {
		const source = await resolveFavicon(company.domain);
		if (!source) continue;

		const iconUrl =
			(await mirror(source, `companies/${company.id}/icon`)) ?? source;

		await db.company.updateMany({
			where: { id: company.id, iconUrl: null },
			data: { iconUrl },
		});
		resolved += 1;
	}

	console.log(`Resolved ${resolved} of ${missing.length} organization icons.`);
}

type SeededContact = {
	id: string;
	name: string;
	female: boolean;
	companyId: string | null;
};

async function seedContacts(
	companies: SeededCompany[],
	ownerIds: string[],
): Promise<SeededContact[]> {
	const contacts: SeededContact[] = [];
	const used = new Set<string>();

	const addClient = async (companyId: string | null) => {
		const { firstName, lastName, female } = clientName();
		const email = `${mailbox(firstName)}.${mailbox(lastName)}@${pick(
			PERSONAL_EMAIL_DOMAINS,
		)}`;
		if (used.has(email)) return;
		used.add(email);

		const contact = await db.contact.upsert({
			where: { email },
			create: {
				firstName,
				lastName,
				email,
				title: pick(CLIENT_NOTES),
				phone: chance(0.6)
					? `+84 9${integer(0, 9)} ${integer(100, 999)} ${integer(1000, 9999)}`
					: null,
				companyId,
				ownerId: pick(ownerIds),
				createdAt: daysFromNow(-integer(10, 300), 12),
			},
			update: {},
			select: { id: true },
		});

		contacts.push({
			id: contact.id,
			name: `${firstName} ${lastName}`,
			female,
			companyId,
		});
	};

	for (const company of companies) {
		for (let index = 0; index < company.clients; index++) {
			await addClient(company.id);
		}
	}

	for (let index = 0; index < STANDALONE_CLIENTS; index++) {
		await addClient(null);
	}

	for (const company of companies) {
		const first = contacts.find((contact) => contact.companyId === company.id);
		if (!first) continue;
		await db.company.update({
			where: { id: company.id },
			data: { primaryContactId: first.id },
		});
	}

	return contacts;
}

type SeededDeal = {
	id: string;
	companyId: string | null;
	contactIds: string[];
	ownerId: string;
	closed: boolean;
};

const SEED_RATES: Record<string, number> = {
	EUR: 1.09,
	GBP: 1.27,
	CAD: 0.73,
	AUD: 0.66,
	JPY: 0.0067,
};

const DEAL_CURRENCIES = ["USD", "USD", "USD", "EUR", "GBP", "JPY", "CAD"];

let seedBase = "USD";

async function seedRates(): Promise<number> {
	const asOf = daysFromNow(-1);

	await db.appSetting.upsert({
		where: { id: SETTINGS_ID },
		create: {
			id: SETTINGS_ID,
			reportingCurrency: DEFAULT_REPORTING_CURRENCY,
		},
		update: {},
		select: { id: true },
	});

	seedBase = await readReportingCurrency(db);

	if (seedBase !== "USD") {
		console.log(
			`Reporting currency is ${seedBase} — seeding a converted figure only for ` +
				`deals already in ${seedBase}; the rates cron converts the rest.`,
		);
	}

	for (const [quoteCurrency, rate] of Object.entries(SEED_RATES)) {
		await db.exchangeRate.upsert({
			where: {
				baseCurrency_quoteCurrency_source: {
					baseCurrency: "USD",
					quoteCurrency,
					source: RateSource.FETCHED,
				},
			},
			create: {
				baseCurrency: "USD",
				quoteCurrency,
				rate,
				asOf,
				source: RateSource.FETCHED,
				provider: "seed",
			},
			update: { rate, asOf, provider: "seed" },
		});
	}

	return Object.keys(SEED_RATES).length;
}

function money(usdAmount: number, currency: string) {
	const rate = SEED_RATES[currency] ?? 1;
	const places = currency === "JPY" ? 0 : 2;
	const amount = Number((usdAmount / rate).toFixed(places));

	const converted =
		currency === seedBase
			? { baseAmount: amount, fxRate: 1 }
			: seedBase === "USD"
				? { baseAmount: Number((amount * rate).toFixed(2)), fxRate: rate }
				: null;

	return {
		amount,
		currency,
		baseAmount: converted?.baseAmount ?? null,
		baseCurrency: converted ? seedBase : null,
		fxRate: converted?.fxRate ?? null,
	};
}

const CLOSED_SHARE = 0.35;

let journeysSeeded = 0;
let journeysClosed = 0;

function nextClosed(): boolean {
	journeysSeeded += 1;
	if (journeysClosed >= Math.round(journeysSeeded * CLOSED_SHARE)) return false;
	journeysClosed += 1;
	return true;
}

type JourneySpec = {
	id: string;
	name: string;
	description: string;
	companyId: string | null;
	usdAmount: number;
	attendees: SeededContact[];
	roles: readonly string[];
	ownerIds: string[];
};

async function seedJourney(spec: JourneySpec): Promise<SeededDeal> {
	const closed = nextClosed();
	const stage = closed
		? chance(0.6)
			? DealStage.ENROLLED
			: DealStage.LOST
		: pick(OPEN_DEAL_STAGES);
	const ownerId = pick(spec.ownerIds);
	const createdDaysAgo = integer(20, 210);
	const createdAt = daysFromNow(-createdDaysAgo, 12);
	const closedDaysAgo = closed
		? integer(0, Math.max(createdDaysAgo - 14, 0))
		: null;
	const stageChangedAt = daysFromNow(
		closedDaysAgo === null ? -integer(1, 20) : -closedDaysAgo,
		12,
	);

	await db.deal.upsert({
		where: { id: spec.id },
		create: {
			id: spec.id,
			name: spec.name,
			description: spec.description,
			companyId: spec.companyId,
			ownerId,
			stage,
			stageChangedAt,
			...(() => {
				const { amount, currency, baseAmount, baseCurrency, fxRate } = money(
					spec.usdAmount,
					pick(DEAL_CURRENCIES),
				);
				return {
					amount,
					currency,
					baseAmount,
					baseCurrency,
					fxRate,
					fxRateAt: fxRate === null ? null : daysFromNow(-1),
				};
			})(),
			expectedCloseDate: daysFromNow(
				closedDaysAgo === null
					? integer(-10, 75)
					: -closedDaysAgo + integer(-4, 9),
			),
			closedAt: closed ? stageChangedAt : null,
			closedReason: stage === DealStage.LOST ? pick(LOST_REASONS) : null,
			createdAt,
		},
		update: {},
	});

	for (const attendee of spec.attendees) {
		await db.dealContact.upsert({
			where: { dealId_contactId: { dealId: spec.id, contactId: attendee.id } },
			create: {
				dealId: spec.id,
				contactId: attendee.id,
				role: pick(spec.roles),
			},
			update: {},
		});
	}

	return {
		id: spec.id,
		companyId: spec.companyId,
		contactIds: spec.attendees.map((attendee) => attendee.id),
		ownerId,
		closed,
	};
}

async function seedDeals(
	companies: SeededCompany[],
	contacts: SeededContact[],
	ownerIds: string[],
): Promise<SeededDeal[]> {
	const deals: SeededDeal[] = [];

	for (const company of companies) {
		const members = contacts.filter(
			(contact) => contact.companyId === company.id,
		);

		for (let n = 0; n < company.journeys; n++) {
			deals.push(
				await seedJourney({
					id: `seed-deal-${slug(company.name)}-${n}`,
					name: `${company.name} — ${pick(ORG_PROGRAMS)}`,
					description: pick(ORG_DEAL_DESCRIPTIONS),
					companyId: company.id,
					usdAmount: integer(12, 45) * 1000,
					attendees: members.slice(0, integer(1, 2)),
					roles: ORG_CONTACT_ROLES,
					ownerIds,
				}),
			);
		}
	}

	const clients = contacts.filter((contact) => contact.companyId === null);

	for (const [index, client] of clients.entries()) {
		const journeys = chance(0.3) ? 2 : 1;

		for (let n = 0; n < journeys; n++) {
			deals.push(
				await seedJourney({
					id: `seed-journey-${index}-${n}`,
					name: `${client.name} — ${pick(
						client.female ? PROGRAMS : PROGRAMS_WITHOUT_PRENATAL,
					)}`,
					description: pick(DEAL_DESCRIPTIONS),
					companyId: null,
					usdAmount: integer(2, 48) * 250,
					attendees: [client],
					roles: ["Client"],
					ownerIds,
				}),
			);
		}
	}

	return deals;
}

async function seedActivities(
	companies: { id: string }[],
	deals: SeededDeal[],
	ownerIds: string[],
): Promise<number> {
	const existing = await db.activity.count();
	if (existing > 0) {
		console.log(`Activities already seeded (${existing}) — skipping.`);
		return existing;
	}

	type ActivityRow = {
		type: ActivityType;
		subject: string | null;
		body: string | null;
		occurredAt: Date | null;
		dueAt: Date | null;
		completedAt: Date | null;
		companyId: string | null;
		contactId: string | null;
		dealId: string | null;
		createdById: string;
		createdAt: Date;
		meta?: { from: DealStage; to: DealStage };
	};

	const rows: ActivityRow[] = [];

	const base = (
		companyId: string | null,
		createdById: string,
		createdAt: Date,
	) => ({
		companyId,
		contactId: null,
		dealId: null,
		occurredAt: null,
		dueAt: null,
		completedAt: null,
		subject: null,
		body: null,
		createdById,
		createdAt,
	});

	for (const deal of deals) {
		for (let n = 0; n < integer(3, 6); n++) {
			const at = daysFromNow(-integer(2, 120), 18);
			const type = pick([
				ActivityType.NOTE,
				ActivityType.CALL,
				ActivityType.EMAIL,
				ActivityType.MEETING,
			]);

			rows.push({
				...base(deal.companyId, deal.ownerId, at),
				type,
				dealId: deal.id,
				contactId: deal.contactIds.length > 0 ? pick(deal.contactIds) : null,
				subject:
					type === ActivityType.CALL
						? pick(CALL_SUBJECTS)
						: type === ActivityType.MEETING
							? pick(MEETING_SUBJECTS)
							: type === ActivityType.EMAIL
								? pick(EMAIL_SUBJECTS)
								: null,
				body: type === ActivityType.NOTE ? pick(NOTE_BODIES) : null,
				occurredAt: type === ActivityType.NOTE ? null : at,
			});
		}

		rows.push({
			...base(deal.companyId, deal.ownerId, daysFromNow(-integer(1, 20), 12)),
			type: ActivityType.STAGE_CHANGE,
			dealId: deal.id,
			subject: "Stage changed",
			meta: {
				from: DealStage.INQUIRY,
				to: deal.closed ? DealStage.ENROLLED : DealStage.CONSULT_DONE,
			},
		});
	}

	for (const deal of deals) {
		if (deal.closed) continue;

		for (let n = 0; n < integer(1, 3); n++) {
			const roll = random();
			const overdue = roll < 0.3;
			const done = roll >= 0.3 && roll < 0.6;
			const dueAt = overdue
				? daysFromNow(-integer(1, 14), 6)
				: daysFromNow(integer(1, 21), 6);

			rows.push({
				...base(deal.companyId, deal.ownerId, daysFromNow(-integer(1, 30), 12)),
				type: ActivityType.TASK,
				dealId: deal.id,
				subject: pick(TASK_SUBJECTS),
				dueAt: done ? daysFromNow(-integer(1, 20), 6) : dueAt,
				completedAt: done ? daysFromNow(-integer(1, 10), 6) : null,
			});
		}
	}

	for (const company of companies) {
		if (!chance(0.6)) continue;
		rows.push({
			...base(company.id, pick(ownerIds), daysFromNow(-integer(5, 200), 12)),
			type: ActivityType.NOTE,
			body: pick(ORG_NOTE_BODIES),
		});
	}

	await db.activity.createMany({ data: rows });
	return rows.length;
}

async function main() {
	const rates = await seedRates();
	const ownerIds = await seedOwners();
	const companies = await seedCompanies(ownerIds);
	const contacts = await seedContacts(companies, ownerIds);
	const deals = await seedDeals(companies, contacts, ownerIds);
	const activities = await seedActivities(companies, deals, ownerIds);

	console.log(
		`Seeded ${companies.length} organizations, ${contacts.length} clients, ` +
			`${deals.length} journeys, ${activities} activities, ${rates} exchange rates.`,
	);
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await db.$disconnect();
	});
