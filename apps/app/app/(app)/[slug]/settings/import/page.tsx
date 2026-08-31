import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import {
	PageShell,
	PageShellContent,
	PageShellDescription,
	PageShellHeader,
	PageShellHeading,
	PageShellLoading,
	PageShellTitle,
} from "@/components/page-shell";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { ImportWizard } from "./import-wizard";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("settings");
	return { title: t("import.metaTitle") };
}

export default async function ImportSettingsPage() {
	const t = await getTranslations("settings");

	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>{t("import.metaTitle")}</PageShellTitle>
					<PageShellDescription>
						{t("import.pageDescription")}
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>

			<PageShellContent>
				<Suspense fallback={<PageShellLoading />}>
					<Import />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Import() {
	await requireSession();

	const queryClient = getServerQueryClient();
	const workspace = await queryClient.fetchQuery(
		getServerTrpc().workspace.get.queryOptions(),
	);

	if (!workspace.canImport) notFound();

	return (
		<HydrateClient>
			<div className="flex max-w-3xl flex-col gap-6">
				<ImportWizard />
			</div>
		</HydrateClient>
	);
}
