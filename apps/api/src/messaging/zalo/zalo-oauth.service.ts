import { createHash, randomInt, randomUUID } from "node:crypto";
import { canManageConnections, WORKSPACE_ID, WORKSPACE_ROLES } from "@crm/auth";
import type { Db, Prisma } from "@crm/db";
import { schemas } from "@crm/validation";
import {
	BadRequestException,
	ForbiddenException,
	Injectable,
	Logger,
} from "@nestjs/common";
import type { z } from "zod";
import { AgentAccessService } from "../../agent/agent-access.service";
import { AgentTriggerService } from "../../agent/agent-trigger.service";
import { InjectDatabase } from "../../database/database.constants";
import {
	appBaseUrl,
	isSafeReturnTo,
	isZaloConfigured,
	MESSAGING_API,
	zaloCredentials,
	zaloRedirectUri,
} from "../messaging-config";
import {
	zaloOaProfileResponse,
	zaloPkceValue,
	zaloTokenResponse,
} from "./zalo-oauth.schema";

type ZaloJson = z.infer<typeof schemas.messaging.zaloJson>;

const CONNECT_MANAGER_ROLES = WORKSPACE_ROLES.filter((role) =>
	canManageConnections(role),
);

export type ZaloConnectStart = { authorizeUrl: string };

@Injectable()
export class ZaloOauthService {
	private readonly logger = new Logger(ZaloOauthService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly access: AgentAccessService,
		private readonly agent: AgentTriggerService,
	) {}

	async start(input: {
		userId: string;
		returnTo?: string;
	}): Promise<ZaloConnectStart> {
		const credentials = await this.assertCanConnect(input.userId);

		const returnTo = input.returnTo ?? MESSAGING_API.oauth.fallbackReturnTo;
		if (!isSafeReturnTo(returnTo)) {
			throw new BadRequestException("returnTo must be a path inside this CRM.");
		}

		const state = randomUUID();
		const verifier = mintVerifier();

		await this.db.verification.create({
			data: {
				id: state,
				identifier: MESSAGING_API.oauth.identifier,
				value: JSON.stringify({
					verifier,
					userId: input.userId,
					returnTo,
				}),
				expiresAt: new Date(Date.now() + MESSAGING_API.oauth.verifierTtlMs),
			},
		});

		const authorizeUrl = new URL(MESSAGING_API.zalo.authorizeUrl);
		authorizeUrl.searchParams.set("app_id", credentials.appId);
		authorizeUrl.searchParams.set("redirect_uri", zaloRedirectUri());
		authorizeUrl.searchParams.set("code_challenge", challengeFor(verifier));
		authorizeUrl.searchParams.set("state", state);

		this.logger.log({ message: "Zalo connect started", userId: input.userId });

		return { authorizeUrl: authorizeUrl.toString() };
	}

	async complete(input: {
		userId: string;
		code?: string;
		state?: string;
	}): Promise<string> {
		await this.assertCanConnect(input.userId);

		const stored = await this.claimVerifier(input.userId, input.state);
		if (!stored) {
			this.logger.warn({ message: "Zalo callback without a live state" });
			return this.redirect(MESSAGING_API.oauth.fallbackReturnTo, "state");
		}

		if (stored.value.userId !== input.userId) {
			this.logger.warn({ message: "Zalo callback from another session" });
			return this.redirect(MESSAGING_API.oauth.fallbackReturnTo, "state");
		}

		if (!input.code) {
			this.logger.warn({ message: "Zalo callback without a code" });
			return this.redirect(stored.value.returnTo, "code");
		}

		const tokens = await this.exchange(input.code, stored.value.verifier);
		if (!tokens) return this.redirect(stored.value.returnTo, "exchange");

		const profile = await this.readProfile(tokens.access_token);
		if (!profile) return this.redirect(stored.value.returnTo, "profile");

		try {
			await this.adopt({
				userId: input.userId,
				externalId: profile.oaid,
				label: profile.name,
				avatarUrl: profile.avatar ?? null,
				verified: profile.is_verified === true,
				accessToken: tokens.access_token,
				refreshToken: tokens.refresh_token,
				expiresInSeconds: tokens.expires_in,
			});
		} catch {
			this.logger.error({
				message: "Zalo connect could not store the OA",
				userId: input.userId,
			});
			return this.redirect(stored.value.returnTo, "book");
		}

		this.logger.log({ message: "Zalo connected", userId: input.userId });

		return this.redirect(stored.value.returnTo, null);
	}

	errorTarget(error: string): string {
		return this.redirect(MESSAGING_API.oauth.fallbackReturnTo, error);
	}

	private async assertCanConnect(userId: string) {
		const credentials = zaloCredentials();
		if (!credentials || !isZaloConfigured()) {
			throw new ForbiddenException(
				"This install has no Zalo app configured, so there is nothing to connect.",
			);
		}

		const role = await this.access.assertMember(userId);
		const managers = await this.db.member.count({
			where: {
				organizationId: WORKSPACE_ID,
				role: { in: [...CONNECT_MANAGER_ROLES] },
			},
		});

		if (managers > 0 && !canManageConnections(role)) {
			throw new ForbiddenException(
				"Only an owner or an admin can connect the Zalo Official Account. One OA is shared by everyone here, so ask one of them to connect it.",
			);
		}

		return credentials;
	}

	private async claimVerifier(userId: string, state?: string) {
		const now = new Date();

		if (state) {
			const row = await this.db.verification.findFirst({
				where: {
					id: state,
					identifier: MESSAGING_API.oauth.identifier,
					expiresAt: { gt: now },
				},
				select: { id: true, value: true },
			});
			if (!row) return null;

			const { count } = await this.db.verification.deleteMany({
				where: { id: row.id },
			});
			if (count === 0) return null;

			const value = zaloPkceValue.safeParse(safeJson(row.value));
			return value.success ? { value: value.data } : null;
		}

		const rows = await this.db.verification.findMany({
			where: {
				identifier: MESSAGING_API.oauth.identifier,
				expiresAt: { gt: now },
			},
			orderBy: { createdAt: "desc" },
			take: MESSAGING_API.oauth.pendingScanLimit,
			select: { id: true, value: true },
		});

		for (const row of rows) {
			const value = zaloPkceValue.safeParse(safeJson(row.value));
			if (!value.success || value.data.userId !== userId) continue;

			const { count } = await this.db.verification.deleteMany({
				where: { id: row.id },
			});
			if (count === 0) return null;

			return { value: value.data };
		}

		return null;
	}

	private async exchange(code: string, verifier: string) {
		const credentials = zaloCredentials();
		if (!credentials) return null;

		const body = await this.post(MESSAGING_API.zalo.tokenUrl, {
			headers: {
				"content-type": "application/x-www-form-urlencoded",
				secret_key: credentials.appSecret,
			},
			body: new URLSearchParams({
				code,
				app_id: credentials.appId,
				grant_type: "authorization_code",
				code_verifier: verifier,
			}),
		});
		if (body === null) return null;

		const parsed = zaloTokenResponse.safeParse(body);
		if (!parsed.success) {
			this.logger.error({ message: "Zalo returned no usable token" });
			return null;
		}

		return parsed.data;
	}

	private async readProfile(accessToken: string) {
		let response: Response;
		try {
			response = await fetch(MESSAGING_API.zalo.profileUrl, {
				method: "GET",
				headers: { access_token: accessToken },
				signal: AbortSignal.timeout(MESSAGING_API.oauth.requestTimeoutMs),
			});
		} catch {
			this.logger.error({ message: "Zalo did not answer the profile read" });
			return null;
		}

		const parsed = zaloOaProfileResponse.safeParse(await safeBody(response));
		if (!parsed.success) {
			this.logger.error({ message: "Zalo returned no usable OA profile" });
			return null;
		}

		return parsed.data.data;
	}

	private async post(
		url: string,
		init: { headers: Record<string, string>; body: URLSearchParams },
	): Promise<unknown> {
		try {
			const response = await fetch(url, {
				method: "POST",
				headers: init.headers,
				body: init.body,
				signal: AbortSignal.timeout(MESSAGING_API.oauth.requestTimeoutMs),
			});

			return await safeBody(response);
		} catch {
			this.logger.error({ message: "Zalo did not answer the token exchange" });
			return null;
		}
	}

	private async adopt(input: {
		userId: string;
		externalId: string;
		label: string;
		avatarUrl: string | null;
		verified: boolean;
		accessToken: string;
		refreshToken: string;
		expiresInSeconds: number;
	}): Promise<void> {
		const now = new Date();
		const tokenExpiresAt = new Date(
			now.getTime() + input.expiresInSeconds * 1000,
		);

		const accountId = await this.db.$transaction(async (tx) => {
			const account = await tx.messagingAccount.upsert({
				where: {
					channel_externalId: {
						channel: "ZALO",
						externalId: input.externalId,
					},
				},
				create: {
					channel: "ZALO",
					externalId: input.externalId,
					label: input.label,
					avatarUrl: input.avatarUrl,
					verified: input.verified,
					accessToken: input.accessToken,
					refreshToken: input.refreshToken,
					tokenExpiresAt,
					tokenRefreshedAt: now,
					tokenError: null,
					connectedById: input.userId,
					connectedAt: now,
					disconnectedAt: null,
				},
				update: {
					label: input.label,
					avatarUrl: input.avatarUrl,
					verified: input.verified,
					accessToken: input.accessToken,
					refreshToken: input.refreshToken,
					tokenExpiresAt,
					tokenRefreshedAt: now,
					tokenError: null,
					connectedById: input.userId,
					connectedAt: now,
					disconnectedAt: null,
				},
				select: { id: true },
			});

			await this.replaceOthers(tx, account.id, now);

			await this.agent.messageTokenRefreshDue(
				account.id,
				new Date(now.getTime() + MESSAGING_API.zalo.refreshEveryMs),
				tx,
			);

			return account.id;
		});

		this.logger.log({ message: "Zalo token refresh booked", accountId });
	}

	private async replaceOthers(
		tx: Prisma.TransactionClient,
		keptId: string,
		now: Date,
	): Promise<void> {
		const others = await tx.messagingAccount.findMany({
			where: { channel: "ZALO", id: { not: keptId }, disconnectedAt: null },
			select: { id: true },
		});
		if (others.length === 0) return;

		await tx.messagingAccount.updateMany({
			where: { id: { in: others.map((account) => account.id) } },
			data: {
				accessToken: null,
				refreshToken: null,
				tokenExpiresAt: null,
				disconnectedAt: now,
			},
		});

		for (const account of others) {
			await tx.agentTask.updateMany({
				where: {
					kind: MESSAGING_API.tasks.tokenRefreshKind,
					finishedAt: null,
					payload: { path: ["accountId"], equals: account.id },
				},
				data: {
					finishedAt: now,
					outcome: MESSAGING_API.tasks.replacedOutcome,
				},
			});
		}

		await tx.agentTask.updateMany({
			where: { kind: MESSAGING_API.tasks.sendKind, finishedAt: null },
			data: {
				finishedAt: now,
				outcome: MESSAGING_API.tasks.replacedOutcome,
			},
		});
	}

	private redirect(returnTo: string, error: string | null): string {
		const path = isSafeReturnTo(returnTo)
			? returnTo
			: MESSAGING_API.oauth.fallbackReturnTo;
		const [base, query] = path.split("?");
		const params = new URLSearchParams(query ?? "");
		params.set("provider", MESSAGING_API.oauth.provider);
		if (error) params.set("error", error);
		else params.set("connected", "1");

		return `${appBaseUrl()}${base}?${params.toString()}`;
	}
}

function mintVerifier(): string {
	const alphabet = MESSAGING_API.oauth.verifierAlphabet;
	let verifier = "";
	for (let index = 0; index < MESSAGING_API.oauth.verifierLength; index++) {
		verifier += alphabet[randomInt(alphabet.length)];
	}

	return verifier;
}

function challengeFor(verifier: string): string {
	return createHash("sha256").update(verifier, "ascii").digest("base64url");
}

function safeJson(value: string): ZaloJson | null {
	try {
		return schemas.messaging.zaloJson.parse(JSON.parse(value));
	} catch {
		return null;
	}
}

async function safeBody(response: Response): Promise<unknown> {
	try {
		return await response.json();
	} catch {
		return null;
	}
}
