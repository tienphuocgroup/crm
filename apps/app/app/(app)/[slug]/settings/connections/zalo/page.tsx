import Warning from "@carbon/icons-react/es/Warning";
import {
	Alert,
	AlertAction,
	AlertDescription,
	AlertTitle,
} from "@crm/ui/components/alert";
import { Badge } from "@crm/ui/components/badge";
import ZaloLogo from "@crm/ui/components/brand-logos/zalo";
import { Icon } from "@crm/ui/components/icon";
import {
	StatusIndicator,
	type StatusTone,
} from "@crm/ui/components/status-indicator";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { LocalRelativeTime } from "@/components/local-date-time";
import { requireSession } from "@/lib/session";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { ConnectionPage, ConnectionPageLoading } from "../connection-page";
import { type ConnectionQuery, connectErrorOf } from "../oauth-connection-page";
import {
	ZaloConnectButton,
	ZaloConnectError,
	ZaloReconnectButton,
} from "./zalo-connect-button";
import { ZaloDisconnectButton } from "./zalo-disconnect-button";

export const metadata: Metadata = { title: "Zalo Official Account" };

function readZaloStatus() {
	return getServerQueryClient().fetchQuery(
		getServerTrpc().zalo.status.queryOptions(),
	);
}

type ZaloStatus = Awaited<ReturnType<typeof readZaloStatus>>;

type ZaloConnectionPageProps = {
	params: Promise<{ slug: string }>;
	searchParams: Promise<ConnectionQuery>;
};

export default function ZaloConnectionPage(props: ZaloConnectionPageProps) {
	return (
		<Suspense fallback={<ConnectionPageLoading />}>
			<ZaloConnectionPageContent {...props} />
		</Suspense>
	);
}

async function ZaloConnectionPageContent({
	params,
	searchParams,
}: ZaloConnectionPageProps) {
	await requireSession();
	const [{ slug }, query] = await Promise.all([params, searchParams]);
	const status = await readZaloStatus();

	if (!status.configured) return <UnconfiguredZalo />;
	if (!status.connected) {
		return (
			<PreConnectZalo
				canManage={status.canManage}
				connectError={connectErrorOf(query, "zalo")}
				slug={slug}
			/>
		);
	}

	return (
		<ConnectedZalo
			connectError={connectErrorOf(query, "zalo")}
			slug={slug}
			status={status}
		/>
	);
}

function Heading({ status }: { status: string }) {
	return (
		<div className="flex items-center gap-3">
			<ZaloLogo className="size-6" />
			<h1 className="font-medium text-xl">Zalo Official Account</h1>
			<span className="ml-auto text-muted-foreground text-sm">{status}</span>
		</div>
	);
}

async function UnconfiguredZalo() {
	const t = await getTranslations("settings");

	return (
		<ConnectionPage centered>
			<header className="flex flex-col gap-3 px-(--spacing-block-inline)">
				<Heading status={t("connections.zaloNotConfiguredLabel")} />
				<p className="text-muted-foreground text-sm leading-relaxed">
					{t("connections.zaloUnavailableDescription")}
				</p>
			</header>
		</ConnectionPage>
	);
}

async function PreConnectZalo({
	slug,
	canManage,
	connectError,
}: {
	slug: string;
	canManage: boolean;
	connectError?: string;
}) {
	const t = await getTranslations("settings");

	return (
		<ConnectionPage centered>
			<header className="flex flex-col gap-3 px-(--spacing-block-inline)">
				<Heading status={t("connections.zaloNotConnectedLabel")} />
				<p className="text-muted-foreground text-sm leading-relaxed">
					{t("connections.zaloConnectingIntro")}
				</p>
			</header>
			<Capabilities />
			<p className="px-(--spacing-block-inline) text-muted-foreground text-sm leading-relaxed">
				{t("connections.zaloCustomerStartsNotice")}
			</p>
			<div className="flex items-center gap-4 border-y px-(--spacing-block-inline) py-5">
				<ZaloConnectButton
					canManage={canManage}
					connectError={connectError}
					slug={slug}
				/>
				<p className="text-muted-foreground text-xs">
					{t("connections.zaloApproveNotice")}
				</p>
			</div>
		</ConnectionPage>
	);
}

async function ConnectedZalo({
	connectError,
	slug,
	status,
}: {
	connectError?: string;
	slug: string;
	status: ZaloStatus;
}) {
	const t = await getTranslations("settings");
	const refreshedAt = status.tokenRefreshedAt;
	const lastInboundAt = status.lastInboundAt;

	return (
		<ConnectionPage>
			<header className="flex flex-col gap-2 px-(--spacing-block-inline)">
				<div className="flex items-center gap-3">
					<ZaloLogo className="size-6" />
					<h1 className="font-medium text-xl">Zalo Official Account</h1>
					<span className="ml-auto text-muted-foreground text-sm">
						{status.oaName ?? t("connections.connected")}
					</span>
					{status.verified ? (
						<Badge variant="secondary">
							{t("connections.zaloVerifiedBadge")}
						</Badge>
					) : null}
					<ZaloDisconnectButton
						canManage={status.canManage}
						oaName={status.oaName}
					/>
				</div>
				{status.canManage ? null : (
					<p className="text-muted-foreground text-sm">
						{t("connections.zaloMemberNotice")}
					</p>
				)}
			</header>
			{status.tokenError ? (
				<div className="px-(--spacing-block-inline)">
					<Alert variant="warning">
						<Icon icon={Warning} />
						<AlertTitle>{t("connections.zaloTokenNeedsReconnect")}</AlertTitle>
						<AlertDescription>
							<span>{status.tokenError}</span>
						</AlertDescription>
						<AlertAction>
							<ZaloReconnectButton canManage={status.canManage} slug={slug} />
						</AlertAction>
					</Alert>
				</div>
			) : null}
			{connectError ? (
				<div className="px-(--spacing-block-inline)">
					<ZaloConnectError error={connectError} />
				</div>
			) : null}
			<section className="flex flex-col gap-3 border-y px-(--spacing-block-inline) py-5">
				<StatusIndicator
					label={
						status.tokenError ? (
							t("connections.zaloTokenNeedsReconnect")
						) : refreshedAt ? (
							<>
								{t("connections.zaloTokenRefreshedLabel")}{" "}
								<LocalRelativeTime date={refreshedAt} />
							</>
						) : (
							t("connections.zaloTokenNotRefreshedYet")
						)
					}
					size="sm"
					tone={tokenTone(status)}
				/>
				<StatusIndicator
					label={
						lastInboundAt ? (
							<>
								{t("connections.zaloLastMessageLabel")}{" "}
								<LocalRelativeTime date={lastInboundAt} />
							</>
						) : (
							t("connections.zaloNoMessagesYet")
						)
					}
					size="sm"
					tone={lastInboundAt ? "success" : "neutral"}
				/>
				<StatusIndicator
					label={
						status.unmatchedCount > 0 ? (
							<Link
								className="font-medium text-foreground underline underline-offset-4"
								href={`/${slug}/messages?filter=unmatched`}
							>
								{t("connections.zaloUnmatchedPeople", {
									count: status.unmatchedCount,
								})}
							</Link>
						) : (
							t("connections.zaloEveryoneMatched")
						)
					}
					size="sm"
					tone={status.unmatchedCount > 0 ? "warning" : "neutral"}
				/>
			</section>
			<Capabilities />
			<p className="px-(--spacing-block-inline) text-muted-foreground text-sm leading-relaxed">
				{t("connections.zaloCustomerStartsNotice")}
			</p>
		</ConnectionPage>
	);
}

async function Capabilities() {
	const t = await getTranslations("settings");

	return (
		<section className="flex flex-col gap-2 px-(--spacing-block-inline) text-sm">
			<CapabilityRow
				label={t("connections.bringsInLabel")}
				value={t("connections.zaloBringsIn")}
			/>
			<CapabilityRow
				label={t("connections.sendsLabel")}
				value={t("connections.zaloSends")}
			/>
		</section>
	);
}

function CapabilityRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex gap-4">
			<span className="w-22 shrink-0 text-muted-foreground">{label}</span>
			<span>{value}</span>
		</div>
	);
}

function tokenTone(status: ZaloStatus): StatusTone {
	if (status.tokenError) return "error";
	return status.tokenRefreshedAt ? "success" : "warning";
}
