import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import {
	PageShell,
	PageShellActions,
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
import { apiKeysSearchParams } from "./api-keys-search-params";
import { ApiKeysTable } from "./api-keys-table";
import { CreateApiKeySheet } from "./create-api-key-sheet";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("settings");
	return { title: t("apiKeys.metaTitle") };
}

export default async function ApiKeysSettingsPage({
	searchParams,
}: PageProps<"/[slug]/settings/api-keys">) {
	const t = await getTranslations("settings");

	return (
		<PageShell className="min-h-0">
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>{t("apiKeys.metaTitle")}</PageShellTitle>
					<PageShellDescription>
						{t("apiKeys.pageDescription")}
					</PageShellDescription>
				</PageShellHeading>

				<PageShellActions>
					<CreateApiKeySheet />
				</PageShellActions>
			</PageShellHeader>

			<PageShellContent className="min-h-0">
				<Suspense fallback={<PageShellLoading />}>
					<ApiKeys searchParams={searchParams} />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function ApiKeys({
	searchParams,
}: Pick<PageProps<"/[slug]/settings/api-keys">, "searchParams">) {
	await requireSession();

	const values = await apiKeysSearchParams.load(searchParams);

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();

	await queryClient.prefetchQuery(
		trpc.apiKeys.list.queryOptions(apiKeysSearchParams.toInput(values)),
	);

	return (
		<HydrateClient>
			<ApiKeysTable />
		</HydrateClient>
	);
}
