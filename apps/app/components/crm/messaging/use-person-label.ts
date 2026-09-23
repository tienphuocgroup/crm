"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";
import type { PersonLabel } from "@/lib/messaging";

export function usePersonLabel(): (label: PersonLabel) => string {
	const t = useTranslations("contacts");

	return useCallback(
		(label: PersonLabel) =>
			label.kind === "name" ? label.name : t(label.key, label.params),
		[t],
	);
}
