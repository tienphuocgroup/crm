import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { requireMailboxAccess } from "@/lib/session";
import { ResearchForm } from "./research-form";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("landing");
	return { title: t("researchKeyMetaTitle") };
}

export const instant = false;

export default async function ResearchKeyPage() {
	const t = await getTranslations("landing");
	await requireMailboxAccess();

	return (
		<AuthShell>
			<AuthHeading
				title={t("researchKeyTitle")}
				description={t("researchKeyDescription")}
			/>

			<ResearchForm />
		</AuthShell>
	);
}
