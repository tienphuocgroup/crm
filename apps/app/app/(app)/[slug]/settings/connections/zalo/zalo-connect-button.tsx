"use client";

import { Button } from "@crm/ui/components/button";
import { useTranslations } from "next-intl";
import { API_URL } from "@/lib/env";

function connectHref(slug: string): string {
	const returnTo = `/${slug}/settings/connections/zalo`;
	return `${API_URL}/api/messaging/zalo/connect?returnTo=${encodeURIComponent(returnTo)}`;
}

function connectErrorMessages(
	t: ReturnType<typeof useTranslations>,
): Record<string, string> {
	return {
		book: t("connections.zaloConnectErrorBook"),
		code: t("connections.zaloConnectErrorCode"),
		exchange: t("connections.zaloConnectErrorExchange"),
		profile: t("connections.zaloConnectErrorProfile"),
		state: t("connections.zaloConnectErrorState"),
	};
}

export function ZaloConnectError({ error }: { error?: string }) {
	const t = useTranslations("settings");

	if (!error) return null;

	return (
		<p className="max-w-sm text-destructive text-xs" role="alert">
			{connectErrorMessages(t)[error] ??
				t("connections.zaloConnectErrorFallback", {
					error: error.replaceAll("_", " "),
				})}
		</p>
	);
}

export function ZaloConnectButton({
	slug,
	canManage,
	connectError,
}: {
	slug: string;
	canManage: boolean;
	connectError?: string;
}) {
	const t = useTranslations("settings");
	const label = t("connections.zaloConnectButtonLabel");

	return (
		<div className="flex min-w-0 flex-col gap-2">
			{canManage ? (
				<Button asChild>
					<a href={connectHref(slug)}>{label}</a>
				</Button>
			) : (
				<Button disabled>{label}</Button>
			)}
			{canManage ? null : (
				<p className="max-w-sm text-muted-foreground text-xs">
					{t("connections.zaloMemberNotice")}
				</p>
			)}
			<ZaloConnectError error={connectError} />
		</div>
	);
}

export function ZaloReconnectButton({
	slug,
	canManage,
}: {
	slug: string;
	canManage: boolean;
}) {
	const t = useTranslations("settings");
	if (!canManage) return null;

	return (
		<Button asChild size="xs" variant="contrast">
			<a href={connectHref(slug)}>{t("connections.zaloReconnectButton")}</a>
		</Button>
	);
}
