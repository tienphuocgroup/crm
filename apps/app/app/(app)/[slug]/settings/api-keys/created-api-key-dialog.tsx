"use client";

import { Button } from "@crm/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@crm/ui/components/dialog";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "@crm/ui/components/input-group";
import { useTranslations } from "next-intl";
import type { RouterOutputs } from "@/lib/trpc/types";
import { CopyValue } from "../copy-value";

type CreatedApiKey = RouterOutputs["apiKeys"]["create"];

export function CreatedApiKeyDialog({
	apiKey,
	onOpenChange,
}: {
	apiKey: CreatedApiKey | null;
	onOpenChange: (open: boolean) => void;
}) {
	const t = useTranslations("settings");

	return (
		<Dialog open={apiKey !== null} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						{t("apiKeys.createdTitle", {
							name: apiKey?.name ?? t("apiKeys.keyLabel"),
						})}
					</DialogTitle>
					<DialogDescription>
						{t("apiKeys.createdDescription")}
					</DialogDescription>
				</DialogHeader>

				<InputGroup>
					<InputGroupInput
						value={apiKey?.key ?? ""}
						readOnly
						className="font-mono"
					/>
					<InputGroupAddon align="inline-end">
						<CopyValue
							value={apiKey?.key ?? ""}
							label={t("apiKeys.keyLabel")}
						/>
					</InputGroupAddon>
				</InputGroup>

				<DialogFooter>
					<Button onClick={() => onOpenChange(false)}>
						{t("apiKeys.done")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
