"use client";

import {
	Command,
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@crm/ui/components/command";
import { PersonAvatar } from "@crm/ui/components/person-avatar";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

const MIN_QUERY_LENGTH = 2;

export function useLinkContact(onLinked?: () => void) {
	const t = useTranslations("contacts");
	const trpc = useTRPC();
	const cache = useCrmCache();

	return useMutation(
		trpc.messaging.linkContact.mutationOptions({
			onSuccess: async (_result, variables) => {
				await Promise.all([
					cache.messaging(),
					cache.contact(variables.contactId),
				]);
				toast.success(t("messagingLinkedToast"));
				onLinked?.();
			},
			onError: (error) => toast.error(error.message),
		}),
	);
}

export function LinkContactDialog({
	onOpenChange,
	open,
	threadId,
}: {
	onOpenChange: (open: boolean) => void;
	open: boolean;
	threadId: string;
}) {
	const t = useTranslations("contacts");
	const nav = useTranslations("nav");
	const trpc = useTRPC();
	const [query, setQuery] = useState("");

	const link = useLinkContact(() => {
		setQuery("");
		onOpenChange(false);
	});

	const results = useQuery({
		...trpc.search.quick.queryOptions({ q: query }),
		enabled: open && query.trim().length >= MIN_QUERY_LENGTH,
		placeholderData: (previous) => previous,
	});

	const hits = (results.data?.hits ?? []).filter(
		(hit) => hit.kind === "contact",
	);

	return (
		<CommandDialog
			open={open}
			onOpenChange={onOpenChange}
			title={t("messagingLinkDialogTitle")}
			description={t("messagingLinkDialogDescription")}
		>
			<Command shouldFilter={false}>
				<CommandInput
					placeholder={t("messagingLinkSearchPlaceholder")}
					value={query}
					onValueChange={setQuery}
				/>
				<CommandList>
					<CommandEmpty>
						{query.trim().length < MIN_QUERY_LENGTH
							? t("messagingLinkMinChars")
							: t("messagingLinkNoResults")}
					</CommandEmpty>

					{hits.length > 0 ? (
						<CommandGroup heading={nav("contacts")}>
							{hits.map((hit) => (
								<CommandItem
									key={hit.id}
									value={hit.id}
									disabled={link.isPending}
									onSelect={() => link.mutate({ threadId, contactId: hit.id })}
								>
									<PersonAvatar name={hit.label} size="sm" src={hit.imageUrl} />
									<span className="flex min-w-0 flex-col">
										<span className="truncate">{hit.label}</span>
										{hit.detail ? (
											<span className="truncate text-muted-foreground text-xs">
												{hit.detail}
											</span>
										) : null}
									</span>
								</CommandItem>
							))}
						</CommandGroup>
					) : null}
				</CommandList>
			</Command>
		</CommandDialog>
	);
}
