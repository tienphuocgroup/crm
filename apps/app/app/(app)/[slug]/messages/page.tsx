import ZaloLogo from "@crm/ui/components/brand-logos/zalo";
import { Button } from "@crm/ui/components/button";
import { Spinner } from "@crm/ui/components/spinner";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { requireSession } from "@/lib/session";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { MessagesInbox } from "./messages-inbox";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("contacts");

	return { title: t("messagingMetaTitle") };
}

type MessagesPageProps = { params: Promise<{ slug: string }> };

export default function MessagesPage(props: MessagesPageProps) {
	return (
		<Suspense fallback={<MessagesLoading />}>
			<MessagesPageContent {...props} />
		</Suspense>
	);
}

async function MessagesPageContent({ params }: MessagesPageProps) {
	await requireSession();

	const [{ slug }, status] = await Promise.all([
		params,
		getServerQueryClient().fetchQuery(
			getServerTrpc().zalo.status.queryOptions(),
		),
	]);

	if (!status.configured || !status.connected) {
		return <MessagesPreConnect slug={slug} />;
	}

	return <MessagesInbox canManage={status.canManage} />;
}

function MessagesLoading() {
	return (
		<main className="flex min-h-0 min-w-0 flex-1 items-center justify-center">
			<Spinner size="lg" />
		</main>
	);
}

async function MessagesPreConnect({ slug }: { slug: string }) {
	const t = await getTranslations("contacts");

	return (
		<main className="flex min-h-0 min-w-0 flex-1 flex-col justify-center px-(--spacing-page-inline) pt-(--spacing-page-top) pb-(--spacing-page-bottom)">
			<div className="mx-auto flex w-full max-w-(--container-narrow) flex-col items-center gap-4 text-center">
				<ZaloLogo className="size-6" />
				<h1 className="font-medium text-xl">{t("messagingMetaTitle")}</h1>
				<p className="text-muted-foreground text-sm leading-relaxed">
					{t("messagingPreConnectDescription")}
				</p>
				<Button asChild size="sm">
					<Link href={`/${slug}/settings/connections/zalo`}>
						{t("messagingConnectZaloAction")}
					</Link>
				</Button>
			</div>
		</main>
	);
}
