"use client";

import { signIn } from "@crm/auth/client";
import type { MailboxProviderId } from "@crm/auth/scopes";
import GoogleLogo from "@crm/ui/components/brand-logos/google";
import MicrosoftLogo from "@crm/ui/components/brand-logos/microsoft";
import { Button } from "@crm/ui/components/button";
import { Spinner } from "@crm/ui/components/spinner";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

const PROVIDER_META = {
	google: { name: "Google", Logo: GoogleLogo },
	microsoft: { name: "Microsoft", Logo: MicrosoftLogo },
} as const satisfies Record<MailboxProviderId, unknown>;

export function SocialSignIn({ provider }: { provider: MailboxProviderId }) {
	const t = useTranslations("landing");
	const [pending, setPending] = useState(false);

	const { name, Logo } = PROVIDER_META[provider];

	function fail(message?: string) {
		setPending(false);
		toast.error(message ?? t("signInServiceUnreachable"));
	}

	async function handleClick() {
		setPending(true);

		const origin = window.location.origin;

		const { error } = await signIn.social({
			provider,
			callbackURL: `${origin}/`,
			errorCallbackURL: `${origin}/sign-in`,
		});

		if (error) fail(error.message);
	}

	return (
		<Button
			className="w-full"
			disabled={pending}
			onClick={() => {
				handleClick().catch(() => fail());
			}}
			type="button"
			variant="outline"
		>
			{pending ? (
				<Spinner data-icon="inline-start" />
			) : (
				<Logo data-icon="inline-start" className="size-4" />
			)}
			{t("continueWithProvider", { name })}
		</Button>
	);
}
