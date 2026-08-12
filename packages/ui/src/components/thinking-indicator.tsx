"use client";

import { DotMatrix } from "@crm/ui/components/dot-matrix";
import { Shimmer } from "@crm/ui/components/shimmer";
import { useUiStrings } from "@crm/ui/components/ui-strings-provider";
import { cn } from "@crm/ui/lib/utils";

export function ThinkingIndicator({
	label,
	className,
}: {
	label?: string;
	className?: string;
}) {
	const strings = useUiStrings();

	return (
		<div className={cn("flex min-w-0 items-center gap-2 text-sm", className)}>
			<DotMatrix decorative />
			<Shimmer className="text-muted-foreground">
				{label ?? strings.thinkingIndicatorLabel}
			</Shimmer>
		</div>
	);
}
