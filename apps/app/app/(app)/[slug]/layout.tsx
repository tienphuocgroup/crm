import { db } from "@crm/db";
import { cookies } from "next/headers";
import { notFound, unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AppHeader, AppHeaderFallback } from "@/components/app-header";
import { AppIconRail, AppIconRailFallback } from "@/components/app-icon-rail";
import { QuickSwitcher } from "@/components/crm/quick-switcher";
import { RecordSheetHost } from "@/components/crm/record-sheet/record-sheet-host";
import { LocaleCookieSync } from "@/components/locale-cookie-sync";
import { MobileNavProvider } from "@/components/mobile-nav";
import { isSupportedLocale, LOCALE_COOKIE } from "@/i18n/locale";
import { getSession, requireMailboxAccess } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";

export default function AppLayout({
	children,
	params,
}: LayoutProps<"/[slug]">) {
	return (
		<MobileNavProvider>
			<div className="isolate flex h-svh flex-col">
				<Suspense fallback={<AppHeaderFallback />}>
					<WorkspaceHeader params={params} />
				</Suspense>

				<div className="flex min-h-0 flex-1">
					<Suspense fallback={<AppIconRailFallback />}>
						<AppIconRail />
					</Suspense>
					{children}
				</div>

				<Suspense fallback={null}>
					<RecordSheetHost />
				</Suspense>

				<Suspense fallback={null}>
					<QuickSwitcher />
				</Suspense>

				<Suspense fallback={null}>
					<LocaleReconciler />
				</Suspense>
			</div>
		</MobileNavProvider>
	);
}

async function LocaleReconciler() {
	const store = await cookies();
	if (store.has(LOCALE_COOKIE)) return null;

	const session = await getSession();
	if (!session) return null;

	const user = await db.user.findUnique({
		where: { id: session.user.id },
		select: { locale: true },
	});

	if (!user?.locale || !isSupportedLocale(user.locale)) return null;

	return <LocaleCookieSync locale={user.locale} />;
}

async function WorkspaceHeader({
	params,
}: Pick<LayoutProps<"/[slug]">, "params">) {
	await connection();
	const workspacePromise = getServerQueryClient()
		.fetchQuery(getServerTrpc().workspace.get.queryOptions())
		.catch((error: unknown) => {
			unstable_rethrow(error);
			return null;
		});
	const [{ user }, { slug }, workspace] = await Promise.all([
		requireMailboxAccess(),
		params,
		workspacePromise,
	]);

	if (workspace && workspace.slug !== slug) notFound();

	return (
		<HydrateClient>
			<AppHeader
				user={{
					name: user.name,
					email: user.email,
					image: user.image ?? null,
				}}
			/>
		</HydrateClient>
	);
}
