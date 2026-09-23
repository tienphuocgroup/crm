"use client";

import Send from "@carbon/icons-react/es/Send";
import { MESSAGING_POLICY } from "@crm/db/messaging";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import { Spinner } from "@crm/ui/components/spinner";
import { Textarea } from "@crm/ui/components/textarea";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { useState } from "react";
import { LocalDateTime } from "@/components/local-date-time";
import { useTRPC } from "@/lib/trpc/client";
import { composerState } from "./composer-state";
import type { SendMessage } from "./use-send-message";

const WINDOW_OPTIONS: Intl.DateTimeFormatOptions = {
	month: "short",
	day: "numeric",
	hour: "numeric",
	minute: "2-digit",
};

export function MessageComposer({
	sender,
	threadId,
}: {
	sender: SendMessage;
	threadId: string;
}) {
	const t = useTranslations("contacts");
	const trpc = useTRPC();
	const [draft, setDraft] = useState("");

	const eligibility = useQuery({
		...trpc.messaging.eligibility.queryOptions({ threadId }),
		staleTime: 0,
	});

	if (eligibility.isError) {
		return (
			<ComposerFooter>
				<p className="text-muted-foreground text-xs">
					{eligibility.error.message}
				</p>
			</ComposerFooter>
		);
	}

	if (!eligibility.data) {
		return (
			<ComposerFooter>
				<Spinner />
			</ComposerFooter>
		);
	}

	const state = composerState(eligibility.data);

	if (state.mode === "blocked") {
		return (
			<ComposerFooter>
				<p className="text-muted-foreground text-xs">{state.reason}</p>
			</ComposerFooter>
		);
	}

	const body = draft.trim();

	const submit = () => {
		if (!body || sender.pending) return;
		sender.send(body, () => setDraft(""));
	};

	return (
		<ComposerFooter>
			<p className="text-muted-foreground text-xs">
				{t.rich(state.noteKey, {
					closesAt: () => (
						<LocalDateTime
							date={state.params.windowClosesAt}
							options={WINDOW_OPTIONS}
						/>
					),
				})}
			</p>

			{sender.blocked ? (
				<p className="text-destructive text-xs">{sender.blocked}</p>
			) : null}

			<div className="flex items-end gap-2">
				<Textarea
					aria-label={t("messagingComposerLabel")}
					disabled={sender.pending}
					maxLength={MESSAGING_POLICY.maxBodyLength}
					onChange={(event) => setDraft(event.target.value)}
					onKeyDown={(event) => {
						if (event.key !== "Enter" || event.shiftKey) return;
						if (event.nativeEvent.isComposing) return;
						event.preventDefault();
						submit();
					}}
					placeholder={t("messagingComposerPlaceholder")}
					size="sm"
					value={draft}
				/>
				<Button
					disabled={!body || sender.pending}
					onClick={submit}
					size="icon-sm"
				>
					{sender.pending ? <Spinner /> : <Icon icon={Send} />}
					<span className="sr-only">{t("messagingSendAction")}</span>
				</Button>
			</div>
		</ComposerFooter>
	);
}

function ComposerFooter({ children }: { children: ReactNode }) {
	return (
		<div className="flex shrink-0 flex-col gap-2 border-t px-(--spacing-block-inline) py-3">
			{children}
		</div>
	);
}
