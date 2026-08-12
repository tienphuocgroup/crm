"use client";

import Checkmark from "@carbon/icons-react/es/Checkmark";
import Copy from "@carbon/icons-react/es/Copy";
import ClaudeLogo from "@crm/ui/components/brand-logos/claude";
import { Button } from "@crm/ui/components/button";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { type CtaLocation, captureLanding } from "./analytics";

/**
 * The page's leading action: hand the whole setup to a coding agent. It stands
 * where a "Get started" would, because on a repo you fork rather than sign up
 * for, taking the prompt is what getting started means.
 */
export function SetupPromptButton({ location }: { location: CtaLocation }) {
	const t = useTranslations("landing");
	const [copied, setCopied] = useState(false);

	async function copy() {
		await navigator.clipboard.writeText(t("setupPrompt"));
		captureLanding("setup_prompt_copied", location);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	}

	return (
		<Button
			variant="outline"
			size="xl"
			onClick={copy}
			aria-label={t("copySetupPromptAriaLabel")}
		>
			<ClaudeLogo data-icon="inline-start" className="size-4" />
			{copied ? t("copiedToClipboard") : t("copySetupPromptAriaLabel")}
			{copied ? (
				<Checkmark
					data-icon="inline-end"
					className="ml-1.5 size-3.5 text-primary"
				/>
			) : (
				<Copy
					data-icon="inline-end"
					className="ml-1.5 size-3.5 text-muted-foreground"
				/>
			)}
		</Button>
	);
}
