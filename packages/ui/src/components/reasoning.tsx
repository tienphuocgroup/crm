"use client";

import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@crm/ui/components/accordion";
import { Shimmer } from "@crm/ui/components/shimmer";
import { useUiStrings } from "@crm/ui/components/ui-strings-provider";
import { cn } from "@crm/ui/lib/utils";
import type { ReactNode } from "react";

export function Reasoning({
	children,
	className,
	isStreaming = false,
	label,
}: {
	children: ReactNode;
	className?: string;
	isStreaming?: boolean;
	label?: string;
}) {
	const strings = useUiStrings();

	return (
		<Accordion
			key={isStreaming ? "streaming" : "settled"}
			type="single"
			collapsible
			defaultValue={isStreaming ? "reasoning" : undefined}
			className={cn(className)}
		>
			<AccordionItem value="reasoning">
				<AccordionTrigger variant="subtle">
					{isStreaming ? (
						<Shimmer>{strings.reasoningThinking}</Shimmer>
					) : (
						(label ?? strings.reasoningLabel)
					)}
				</AccordionTrigger>
				<AccordionContent className="text-muted-foreground">
					{children}
				</AccordionContent>
			</AccordionItem>
		</Accordion>
	);
}
