import { mailboxGrantsNeeded } from "@crm/auth";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { requireSession, signInAccounts } from "@/lib/session";
import { GrantAccess } from "./grant-access";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("landing");
	return { title: t("grantAccessMetaTitle") };
}

export const instant = false;

export default async function GrantAccessPage() {
	const t = await getTranslations("landing");
	const { user } = await requireSession();

	const providers = mailboxGrantsNeeded(await signInAccounts(user.id));

	if (providers.length === 0) {
		redirect("/");
	}

	const only = providers.length === 1 ? providers[0] : undefined;
	const description: Record<string, string> = {
		google: t("grantAccessDescriptionGoogle"),
		microsoft: t("grantAccessDescriptionMicrosoft"),
	};
	const both = t("grantAccessDescriptionBoth");

	return (
		<AuthShell>
			<AuthHeading
				title={t("grantAccessTitle")}
				description={(only ? description[only] : undefined) ?? both}
			/>

			<GrantAccess providers={providers} />

			<p className="text-center text-muted-foreground text-sm/5">
				{t("grantAccessPrivacyNotice")}
			</p>
		</AuthShell>
	);
}
