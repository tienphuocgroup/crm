"use client";

import { Button } from "@crm/ui/components/button";
import { useTranslations } from "next-intl";
import { API_URL } from "@/lib/env";

function connectHref(slug: string): string {
	const returnTo = `/${slug}/settings/connections/zalo`;
	return `${API_URL}/api/messaging/zalo/connect?returnTo=${encodeURIComponent(returnTo)}`;
}

const CONNECT_ERROR_KEYS = {
	book: "connections.zaloConnectErrorBook",
	code: "connections.zaloConnectErrorCode",
	exchange: "connections.zaloConnectErrorExchange",
	profile: "connections.zaloConnectErrorProfile",
	state: "connections.zaloConnectErrorState",
} satisfies Record<string, string>;

function isConnectErrorCode(
	code: string,
): code is keyof typeof CONNECT_ERROR_KEYS {
	return Object.hasOwn(CONNECT_ERROR_KEYS, code);
}

export function ZaloConnectError({ error }: { error?: string }) {
	const t = useTranslations("settings");

	if (!error) return null;

	return (
		<p className="max-w-sm text-destructive text-xs" role="alert">
			{isConnectErrorCode(error)
				? t(CONNECT_ERROR_KEYS[error])
				: t("connections.zaloConnectErrorFallback", {
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
