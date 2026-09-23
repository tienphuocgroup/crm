"use client";

import ZaloLogo from "@crm/ui/components/brand-logos/zalo";
import { Link } from "@crm/ui/components/link";
import NextLink from "next/link";
import { useTranslations } from "next-intl";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

export function MessageThreadEntry({
	contactId,
	displayName,
	messageCount,
	threadId,
}: {
	contactId: string | null;
	displayName: string | null;
	messageCount: number;
	threadId: string;
}) {
	const common = useTranslations("common");
	const contacts = useTranslations("contacts");
	const workspaceUrl = useWorkspaceUrl();
	const openRecord = useOpenRecord();
	const name = displayName?.trim() || contacts("messagingUnknownPerson");

	return (
		<div className="flex flex-wrap items-center gap-2 text-xs">
			<ZaloLogo className="size-4" />
			<span className="text-muted-foreground">
				{common("timeline.messageCount", { count: messageCount })}
			</span>
			<span className="min-w-0 truncate text-muted-foreground">{name}</span>
			{contactId ? (
				<Link asChild variant="quiet">
					<button
						onClick={() =>
							openRecord({ kind: "contact", id: contactId }, "messages")
						}
						type="button"
					>
						{common("timeline.openMessages")}
					</button>
				</Link>
			) : (
				<Link asChild variant="quiet">
					<NextLink
						href={`${workspaceUrl("/messages")}?thread=${threadId}`}
						prefetch={false}
					>
						{common("timeline.openMessages")}
					</NextLink>
				</Link>
			)}
		</div>
	);
}
