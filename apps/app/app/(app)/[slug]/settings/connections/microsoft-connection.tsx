"use client";

import Warning from "@carbon/icons-react/es/Warning";
import { authClient } from "@crm/auth/client";
import { MICROSOFT_SYNC_SCOPES } from "@crm/auth/scopes";
import { Alert, AlertDescription, AlertTitle } from "@crm/ui/components/alert";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@crm/ui/components/alert-dialog";
import MicrosoftLogo from "@crm/ui/components/brand-logos/microsoft";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { Icon } from "@crm/ui/components/icon";
import { Label } from "@crm/ui/components/label";
import { Spinner } from "@crm/ui/components/spinner";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { Switch } from "@crm/ui/components/switch";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { LocalRelativeTime } from "@/components/local-date-time";
import { isSyncing, SYNC_POLL_MS } from "@/lib/sync-status";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

function MicrosoftUnavailable() {
	const t = useTranslations("settings");

	return (
		<Card>
			<CardHeader>
				<CardTitle>
					<div className="flex items-center gap-2">
						Microsoft
						<StatusIndicator
							size="sm"
							tone="neutral"
							label={t("connections.notConfigured")}
						/>
					</div>
				</CardTitle>
				<CardDescription>
					{t("connections.microsoftUnavailableDescription")}
				</CardDescription>
			</CardHeader>
		</Card>
	);
}

function ConnectMicrosoft({ connectError }: { connectError?: string }) {
	const t = useTranslations("settings");
	const [pending, setPending] = useState(false);

	const connectErrors: Record<string, string> = {
		"email_doesn't_match": t("connections.microsoftEmailMismatch"),
	};

	function fail(message?: string) {
		setPending(false);
		toast.error(message ?? t("connections.microsoftUnreachable"));
	}

	async function handleConnect() {
		setPending(true);

		const origin = window.location.origin;

		const { error } = await authClient.linkSocial({
			provider: "microsoft",
			scopes: [...MICROSOFT_SYNC_SCOPES],
			callbackURL: `${origin}/settings/connections`,
			errorCallbackURL: `${origin}/settings/connections?provider=microsoft`,
		});

		if (error) fail(error.message);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>
					<div className="flex items-center gap-2">
						Microsoft
						<StatusIndicator
							size="sm"
							tone="neutral"
							label={t("connections.notConnected")}
						/>
					</div>
				</CardTitle>
				<CardDescription>
					{t("connections.microsoftConnectDescription")}
				</CardDescription>

				<CardAction>
					<Button
						size="sm"
						disabled={pending}
						onClick={() => {
							handleConnect().catch(() => fail());
						}}
						type="button"
					>
						{pending ? (
							<Spinner data-icon="inline-start" />
						) : (
							<MicrosoftLogo data-icon="inline-start" className="size-4" />
						)}
						{t("connections.connect")}
					</Button>
				</CardAction>
			</CardHeader>

			{connectError ? (
				<CardContent>
					<Alert variant="destructive">
						<Icon icon={Warning} />
						<AlertTitle>
							{t("connections.microsoftConnectFailedTitle")}
						</AlertTitle>
						<AlertDescription>
							{connectErrors[connectError] ??
								t("connections.microsoftGenericConnectError")}
						</AlertDescription>
					</Alert>
				</CardContent>
			) : null}
		</Card>
	);
}

export function MicrosoftConnection({
	connectError,
}: {
	connectError?: string;
}) {
	const t = useTranslations("settings");
	const common = useTranslations("common");
	const trpc = useTRPC();
	const cache = useCrmCache();

	const status = useQuery({
		...trpc.microsoft.status.queryOptions(),
		refetchInterval: (query) =>
			query.state.data?.sources.some((source) => isSyncing(source.status))
				? SYNC_POLL_MS
				: false,
	});

	const purge = useMutation(
		trpc.microsoft.purgeSyncedData.mutationOptions({
			onSuccess: async (result) => {
				await cache.microsoft();
				toast.success(
					t("connections.syncedItemsRemoved", { count: result.purged }),
				);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const revoke = useMutation(
		trpc.microsoft.revokeAccess.mutationOptions({
			onSuccess: () =>
				window.location.assign(
					status.data?.required ? "/" : "/settings/connections",
				),
			onError: (error) => toast.error(error.message),
		}),
	);

	const setAutoCreate = useMutation(
		trpc.microsoft.setAutoCreate.mutationOptions({
			onSuccess: () => cache.microsoft({ settle: "record" }),
			onError: (error) => toast.error(error.message),
		}),
	);

	const syncNow = useMutation(
		trpc.microsoft.syncNow.mutationOptions({
			onSuccess: () => cache.microsoft(),
			onError: (error) => toast.error(error.message),
		}),
	);

	if (!status.data) return null;

	const { sources, hasRefreshToken, configured, linked, required } =
		status.data;

	if (!configured) return <MicrosoftUnavailable />;
	if (!linked) return <ConnectMicrosoft connectError={connectError} />;

	const failing = sources.filter(
		(source) => source.status === "NEEDS_RECONNECT" || source.lastError,
	);
	const lastSyncedAt = sources
		.map((source) => source.lastSyncedAt)
		.filter((at): at is string => at !== null)
		.sort()
		.at(-1);

	const healthy = failing.length === 0 && hasRefreshToken;

	return (
		<Card>
			<CardHeader>
				<CardTitle>
					<div className="flex items-center gap-2">
						Microsoft
						<StatusIndicator
							size="sm"
							tone={healthy ? "success" : "warning"}
							label={
								healthy
									? t("connections.connected")
									: t("connections.needsAttention")
							}
						/>
					</div>
				</CardTitle>
				<CardDescription>
					{t("connections.microsoftSyncDescription")}
				</CardDescription>

				<CardAction>
					<Button
						variant="contrast"
						size="sm"
						disabled={syncNow.isPending}
						onClick={() => syncNow.mutate()}
					>
						{syncNow.isPending
							? t("connections.checking")
							: t("connections.checkNow")}
					</Button>
				</CardAction>
			</CardHeader>

			<CardContent>
				{!hasRefreshToken ? (
					<Alert variant="destructive">
						<Icon icon={Warning} />
						<AlertTitle>{t("connections.microsoftNoRefreshToken")}</AlertTitle>
						<AlertDescription>
							{t("connections.signOutAndBackIn")}
						</AlertDescription>
					</Alert>
				) : failing.length > 0 ? (
					failing.map((source) => (
						<Alert key={source.source} variant="destructive">
							<Icon icon={Warning} />
							<AlertTitle>
								{t("connections.sourceSyncFailed", {
									source: t("connections.sourceEmailLabel"),
								})}
							</AlertTitle>
							<AlertDescription>
								{source.lastError ??
									t("connections.microsoftNeedsReconnecting")}
							</AlertDescription>
						</Alert>
					))
				) : (
					<p className="text-muted-foreground text-xs">
						{lastSyncedAt ? (
							<>
								{t("connections.lastChecked")}{" "}
								<LocalRelativeTime date={lastSyncedAt} />
							</>
						) : (
							t("connections.waitingForFirstCheck")
						)}
					</p>
				)}

				{sources.map((source) => (
					<div
						key={source.source}
						className="flex items-center justify-between gap-6"
					>
						<Label
							htmlFor={`auto-create-${source.source}`}
							className="flex flex-col items-start gap-1"
						>
							<span className="text-sm">
								{t("connections.sourceEmailLabel")}
							</span>
							<span className="font-normal text-muted-foreground text-xs">
								{t("connections.autoCreateOnReply")}
							</span>
						</Label>

						<Switch
							id={`auto-create-${source.source}`}
							checked={source.autoCreate}
							disabled={setAutoCreate.isPending}
							onCheckedChange={(enabled) =>
								setAutoCreate.mutate({ source: source.source, enabled })
							}
						/>
					</div>
				))}

				<CardFooter>
					<div className="-ml-2 flex flex-wrap items-center gap-1 text-muted-foreground">
						<AlertDialog>
							<AlertDialogTrigger asChild>
								<Button variant="ghost" size="xs" disabled={purge.isPending}>
									{t("connections.deleteSyncedData")}
								</Button>
							</AlertDialogTrigger>

							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>
										{t("connections.deleteSyncedDataConfirmTitle")}
									</AlertDialogTitle>
									<AlertDialogDescription>
										{t("connections.microsoftDeleteSyncedDataDescription")}
									</AlertDialogDescription>
								</AlertDialogHeader>

								<AlertDialogFooter>
									<AlertDialogCancel>{common("cancel")}</AlertDialogCancel>
									<AlertDialogAction
										variant="destructive"
										onClick={() => purge.mutate()}
									>
										{common("delete")}
									</AlertDialogAction>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>

						<AlertDialog>
							<AlertDialogTrigger asChild>
								<Button variant="ghost" size="xs" disabled={revoke.isPending}>
									{t("connections.disconnectMicrosoft")}
								</Button>
							</AlertDialogTrigger>

							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>
										{t("connections.disconnectMicrosoftConfirmTitle")}
									</AlertDialogTitle>
									<AlertDialogDescription>
										{required
											? t("connections.revokeRequiredWarning")
											: t("connections.microsoftRevokeOptionalWarning")}{" "}
										{t("connections.microsoftNoAutoRevokeNotice")}
									</AlertDialogDescription>
								</AlertDialogHeader>

								<AlertDialogFooter>
									<AlertDialogCancel>{common("cancel")}</AlertDialogCancel>
									<AlertDialogAction
										variant="destructive"
										onClick={() => revoke.mutate()}
									>
										{t("connections.disconnect")}
									</AlertDialogAction>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>

						<Button variant="ghost" size="xs" asChild>
							<Link
								href="https://myapplications.microsoft.com"
								target="_blank"
								rel="noreferrer"
							>
								{t("connections.manageInMicrosoftAccount")}
							</Link>
						</Button>
					</div>
				</CardFooter>
			</CardContent>
		</Card>
	);
}
