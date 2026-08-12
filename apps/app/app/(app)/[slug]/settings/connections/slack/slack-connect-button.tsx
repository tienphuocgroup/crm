"use client";

import { authClient } from "@crm/auth/client";
import { Button } from "@crm/ui/components/button";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

function connectErrorMessages(
	t: ReturnType<typeof useTranslations>,
): Record<string, string> {
	return {
		access_denied: t("connections.slackConnectErrorAccessDenied"),
		account_already_linked_to_different_user: t(
			"connections.slackConnectErrorAlreadyLinked",
		),
		"email_doesn't_match": t("connections.slackConnectErrorEmailMismatch"),
		oauth_code_verification_failed: t(
			"connections.slackConnectErrorVerificationFailed",
		),
		user_info_is_missing: t("connections.slackConnectErrorUserInfoMissing"),
	};
}

async function startSlackOAuth(slug: string, fallbackMessage: string) {
	try {
		const { error } = await authClient.oauth2.link({
			providerId: "slack",
			callbackURL: `${window.location.origin}/${slug}/settings/connections/slack/people`,
			errorCallbackURL: `${window.location.origin}/${slug}/settings/connections/slack?provider=slack`,
		});
		if (error) toast.error(error.message || fallbackMessage);
	} catch (error) {
		toast.error(error instanceof Error ? error.message : fallbackMessage);
	}
}

export function SlackReconnectButton({ slug }: { slug: string }) {
	const t = useTranslations("settings");
	const [pending, setPending] = useState(false);

	return (
		<Button
			disabled={pending}
			onClick={async () => {
				setPending(true);
				await startSlackOAuth(slug, t("connections.slackConnectGenericError"));
				setPending(false);
			}}
			size="xs"
			variant="contrast"
		>
			{pending
				? t("connections.slackOpeningLabel")
				: t("connections.slackReconnectButton")}
		</Button>
	);
}

export function SlackConnectButton({
	slug,
	configured,
	connectError,
}: {
	slug: string;
	configured: boolean;
	connectError?: string;
}) {
	const t = useTranslations("settings");
	const [pending, setPending] = useState(false);
	const connect = async () => {
		setPending(true);
		await startSlackOAuth(slug, t("connections.slackConnectGenericError"));
		setPending(false);
	};
	return (
		<div className="flex min-w-0 flex-col gap-2">
			<Button onClick={() => void connect()} disabled={!configured || pending}>
				{pending
					? t("connections.slackOpeningLabel")
					: configured
						? t("connections.slackConnectButtonLabel")
						: t("connections.slackNotConfiguredLabel")}
			</Button>
			{connectError ? (
				<p role="alert" className="max-w-sm text-destructive text-xs">
					{connectErrorMessages(t)[connectError] ??
						t("connections.slackConnectErrorFallback", {
							error: connectError.replaceAll("_", " "),
						})}
				</p>
			) : null}
		</div>
	);
}
