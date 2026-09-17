"use client";

import { Button } from "@crm/ui/components/button";
import { cn } from "@crm/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

type SettingsNavItem = {
	title: string;
	href: string;
};

const ROOT = "/settings";

function navItems(
	t: ReturnType<typeof useTranslations>,
	canImport = false,
): SettingsNavItem[] {
	return [
		{ title: t("settings.general"), href: ROOT },
		{ title: t("settings.tracking"), href: `${ROOT}/tracking` },
		{ title: t("settings.connections"), href: `${ROOT}/connections` },
		{ title: t("settings.currencies"), href: `${ROOT}/currencies` },
		...(canImport
			? [{ title: t("settings.import"), href: `${ROOT}/import` }]
			: []),
		{ title: t("settings.members"), href: `${ROOT}/members` },
		{ title: t("settings.sso"), href: `${ROOT}/sso` },
	];
}

function isActive(href: string, root: string, pathname: string): boolean {
	return href === root ? pathname === href : pathname.startsWith(href);
}

function NavLink({
	item,
	active,
	className,
}: {
	item: SettingsNavItem;
	active: boolean;
	className: string;
}) {
	return (
		<Button
			asChild
			variant="ghost"
			className={cn(
				"justify-start font-normal text-muted-foreground",
				active &&
					"bg-muted text-foreground hover:bg-muted hover:text-foreground",
				className,
			)}
		>
			<Link
				href={item.href}
				prefetch
				aria-current={active ? "page" : undefined}
				transitionTypes={["nav-lateral"]}
			>
				{item.title}
			</Link>
		</Button>
	);
}

export function SettingsSidebarFallback() {
	const t = useTranslations("nav");
	const items = navItems(t);

	return (
		<>
			<aside className="hidden w-56 shrink-0 border-r md:block [view-transition-name:settings-sidebar]">
				<nav
					aria-label={t("settings.ariaLabel")}
					aria-busy="true"
					className="flex flex-col gap-0.5 p-3"
				>
					{items.map((item) => (
						<Button
							key={item.href}
							variant="ghost"
							disabled
							className="w-full justify-start px-3 font-normal text-muted-foreground"
						>
							{item.title}
						</Button>
					))}
				</nav>
			</aside>

			<nav
				aria-label={t("settings.ariaLabel")}
				aria-busy="true"
				className="flex gap-1 overflow-x-auto border-b p-2 md:hidden [view-transition-name:settings-sidebar]"
			>
				{items.map((item) => (
					<Button
						key={item.href}
						variant="ghost"
						disabled
						className="shrink-0 justify-start px-3 font-normal text-muted-foreground"
					>
						{item.title}
					</Button>
				))}
			</nav>
		</>
	);
}

export function SettingsSidebar() {
	const t = useTranslations("nav");
	const pathname = usePathname();
	const workspaceUrl = useWorkspaceUrl();
	const trpc = useTRPC();
	const workspace = useQuery(trpc.workspace.get.queryOptions());
	const canImport = workspace.data?.canImport === true;

	const root = workspaceUrl(ROOT);
	const items = useMemo(
		() =>
			navItems(t, canImport).map((item) => ({
				...item,
				href: workspaceUrl(item.href),
			})),
		[t, canImport, workspaceUrl],
	);

	return (
		<>
			<aside className="hidden w-56 shrink-0 border-r md:block [view-transition-name:settings-sidebar]">
				<nav
					aria-label={t("settings.ariaLabel")}
					className="flex flex-col gap-0.5 p-3"
				>
					{items.map((item) => (
						<NavLink
							key={item.href}
							item={item}
							active={isActive(item.href, root, pathname)}
							className="w-full px-3"
						/>
					))}
				</nav>
			</aside>

			<nav
				aria-label={t("settings.ariaLabel")}
				className="flex gap-1 overflow-x-auto border-b p-2 md:hidden [view-transition-name:settings-sidebar]"
			>
				{items.map((item) => (
					<NavLink
						key={item.href}
						item={item}
						active={isActive(item.href, root, pathname)}
						className="shrink-0 px-3"
					/>
				))}
			</nav>
		</>
	);
}
