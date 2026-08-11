import type { Metadata } from "next";
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
import { GoogleConnection } from "./google-connection";
import { MicrosoftConnection } from "./microsoft-connection";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("settings");
	return { title: t("connections.metaTitle") };
}

export default async function ConnectionsSettingsPage({
	searchParams,
}: PageProps<"/[slug]/settings/connections">) {
	const t = await getTranslations("settings");

	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>{t("connections.metaTitle")}</PageShellTitle>
					<PageShellDescription>
						{t("connections.pageDescription")}
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>

			<PageShellContent>
				<Suspense fallback={<PageShellLoading />}>
					<Connections searchParams={searchParams} />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Connections({
	searchParams,
}: Pick<PageProps<"/[slug]/settings/connections">, "searchParams">) {
	await requireSession();

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();

	const [{ error, provider }] = await Promise.all([
		searchParams,
		queryClient.prefetchQuery(trpc.google.status.queryOptions()),
		queryClient.prefetchQuery(trpc.microsoft.status.queryOptions()),
	]);

	const connectError = first(error);
	const failed = first(provider);

	return (
		<HydrateClient>
			<div className="flex max-w-3xl flex-col gap-6">
				<GoogleConnection
					connectError={failed === "google" ? connectError : undefined}
				/>

				<MicrosoftConnection
					connectError={failed === "microsoft" ? connectError : undefined}
				/>
			</div>
		</HydrateClient>
	);
}

function first(value: string | string[] | undefined): string | undefined {
	return Array.isArray(value) ? value[0] : value;
}
