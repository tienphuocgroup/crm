import { canManageConnections } from "@crm/auth";
import type { Db } from "@crm/db";
import { ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { AgentAccessService } from "../../agent/agent-access.service";
import { InjectDatabase } from "../../database/database.constants";
import { isZaloConfigured, MESSAGING_API } from "../messaging-config";

export type ZaloStatus = {
	configured: boolean;
	connected: boolean;
	oaName: string | null;
	avatarUrl: string | null;
	verified: boolean;
	tokenRefreshedAt: string | null;
	tokenExpiresAt: string | null;
	tokenError: string | null;
	lastInboundAt: string | null;
	lastOutboundAt: string | null;
	lastWebhookAt: string | null;
	unmatchedCount: number;
	canManage: boolean;
};

@Injectable()
export class ZaloConnectionService {
	private readonly logger = new Logger(ZaloConnectionService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly access: AgentAccessService,
	) {}

	async status(userId: string): Promise<ZaloStatus> {
		const role = await this.access.assertMember(userId);
		const account = await this.db.messagingAccount.findFirst({
			where: { channel: "ZALO", disconnectedAt: null },
			orderBy: { connectedAt: "desc" },
			select: {
				id: true,
				label: true,
				avatarUrl: true,
				verified: true,
				tokenRefreshedAt: true,
				tokenExpiresAt: true,
				tokenError: true,
				lastInboundAt: true,
				lastOutboundAt: true,
				lastWebhookAt: true,
			},
		});

		const unmatchedCount = account
			? await this.db.contactChannelIdentity.count({
					where: { accountId: account.id, contactId: null },
				})
			: 0;

		return {
			configured: isZaloConfigured(),
			connected: Boolean(account),
			oaName: account?.label ?? null,
			avatarUrl: account?.avatarUrl ?? null,
			verified: account?.verified ?? false,
			tokenRefreshedAt: account?.tokenRefreshedAt?.toISOString() ?? null,
			tokenExpiresAt: account?.tokenExpiresAt?.toISOString() ?? null,
			tokenError: account?.tokenError ?? null,
			lastInboundAt: account?.lastInboundAt?.toISOString() ?? null,
			lastOutboundAt: account?.lastOutboundAt?.toISOString() ?? null,
			lastWebhookAt: account?.lastWebhookAt?.toISOString() ?? null,
			unmatchedCount,
			canManage: canManageConnections(role),
		};
	}

	async disconnect(userId: string): Promise<{ ok: true }> {
		const role = await this.access.assertMember(userId);

		if (!canManageConnections(role)) {
			throw new ForbiddenException(
				"Only an owner or an admin can disconnect the Zalo Official Account.",
			);
		}

		const account = await this.db.messagingAccount.findFirst({
			where: { channel: "ZALO", disconnectedAt: null },
			orderBy: { connectedAt: "desc" },
			select: { id: true },
		});

		if (!account) return { ok: true };

		const now = new Date();

		await this.db.$transaction(async (tx) => {
			await tx.messagingAccount.updateMany({
				where: { id: account.id },
				data: {
					accessToken: null,
					refreshToken: null,
					tokenExpiresAt: null,
					disconnectedAt: now,
				},
			});

			await tx.agentTask.updateMany({
				where: {
					kind: MESSAGING_API.tasks.tokenRefreshKind,
					finishedAt: null,
					payload: { path: ["accountId"], equals: account.id },
				},
				data: {
					finishedAt: now,
					outcome: MESSAGING_API.tasks.disconnectedOutcome,
				},
			});

			await tx.agentTask.updateMany({
				where: { kind: MESSAGING_API.tasks.sendKind, finishedAt: null },
				data: {
					finishedAt: now,
					outcome: MESSAGING_API.tasks.disconnectedOutcome,
				},
			});
		});

		this.logger.log({ message: "Zalo disconnected", userId });

		return { ok: true };
	}
}
