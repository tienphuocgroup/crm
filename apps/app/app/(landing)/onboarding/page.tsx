import { DEFAULT_WORKSPACE_NAME } from "@crm/auth";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { requireMailboxAccess } from "@/lib/session";
import { OnboardingForm } from "./onboarding-form";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("landing");
	return { title: t("onboardingMetaTitle") };
}

export const instant = false;

export default async function OnboardingPage() {
	const t = await getTranslations("landing");
	await requireMailboxAccess();

	return (
		<AuthShell>
			<AuthHeading
				title={t("onboardingTitle")}
				description={t("onboardingDescription")}
			/>

			<OnboardingForm placeholder={DEFAULT_WORKSPACE_NAME} />
		</AuthShell>
	);
}
