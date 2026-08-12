"use client";

import {
	DEFAULT_UI_LOCALE,
	mergeUiStrings,
	type UiStrings,
	UiStringsContext,
} from "@crm/ui/lib/ui-strings";
import { type ReactNode, useContext, useMemo } from "react";

export function UiStringsProvider({
	strings,
	locale,
	children,
}: {
	strings?: Partial<UiStrings>;
	locale?: string;
	children: ReactNode;
}) {
	const value = useMemo(
		() => ({
			strings: mergeUiStrings(strings),
			locale: locale ?? DEFAULT_UI_LOCALE,
		}),
		[strings, locale],
	);

	return (
		<UiStringsContext.Provider value={value}>
			{children}
		</UiStringsContext.Provider>
	);
}

export function useUiStrings(): UiStrings {
	return useContext(UiStringsContext).strings;
}

export function useUiLocale(): string {
	return useContext(UiStringsContext).locale;
}
