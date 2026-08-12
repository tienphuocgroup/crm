import SlackLogo from "@crm/ui/components/brand-logos/slack";
import { Spinner } from "@crm/ui/components/spinner";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { requireSession } from "@/lib/session";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { ConnectionPage } from "../../connection-page";
import { SlackPeopleMatches } from "./slack-people-matches";

type SlackPeoplePageProps = {
	params: Promise<{ slug: string }>;
};

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("settings");
	return { title: t("connections.slackPeopleMetaTitle") };
}

export default function SlackPeoplePage(props: SlackPeoplePageProps) {
	return (
		<Suspense
			fallback={
				<ConnectionPage centered>
					<Spinner size="lg" />
				</ConnectionPage>
			}
		>
			<SlackPeoplePageContent {...props} />
		</Suspense>
	);
}

async function SlackPeoplePageContent({ params }: SlackPeoplePageProps) {
	await requireSession();
	const { slug } = await params;
	const queryClient = getServerQueryClient();
	const trpc = getServerTrpc();
	const status = await queryClient.fetchQuery(trpc.slack.status.queryOptions());
	if (!status.connected) redirect(`/${slug}/settings/connections/slack`);
	const [matches, t] = await Promise.all([
		queryClient.fetchQuery(trpc.slack.matches.queryOptions()),
		getTranslations("settings"),
	]);

	return (
		<ConnectionPage centered>
			<header className="flex flex-col gap-3 px-(--spacing-block-inline) text-center">
				<SlackLogo className="mx-auto size-7" />
				<h1 className="font-medium text-2xl tracking-tight">
					{t("connections.slackConnectedTitle")}
				</h1>
				<p className="text-muted-foreground text-sm">
					{t("connections.slackPeopleMatchIntro")}
				</p>
			</header>
			<SlackPeopleMatches slug={slug} initialMatches={matches} />
		</ConnectionPage>
	);
}
