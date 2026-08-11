import { Skeleton } from "@crm/ui/components/skeleton";
import { getTranslations } from "next-intl/server";

export function AgentBuilderShell({
	children,
	sidebar,
}: {
	children: React.ReactNode;
	sidebar: React.ReactNode;
}) {
	return (
		<div className="flex min-h-0 min-w-0 flex-1">
			{sidebar}
			<div className="flex min-w-0 flex-1 flex-col">{children}</div>
		</div>
	);
}

export async function AgentBuilderSidebarFallback() {
	const t = await getTranslations("agent-panel");

	return (
		<aside
			className="hidden w-[213px] flex-none flex-col border-r p-4 md:flex"
			aria-busy="true"
		>
			<div className="flex h-7 items-center pl-2 font-medium text-xs">
				{t("chatsHeading")}
			</div>
			<div className="mt-3 space-y-2 px-2" aria-hidden="true">
				<Skeleton className="h-2.5 w-16" />
				<Skeleton className="h-7 w-full" />
				<Skeleton className="h-7 w-full" />
			</div>
			<span role="status" className="sr-only">
				{t("loadingAgentNavigation")}
			</span>
		</aside>
	);
}
