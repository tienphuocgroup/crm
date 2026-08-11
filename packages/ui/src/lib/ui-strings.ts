import { createContext } from "react";

export type UiStrings = {
	asyncActionError: string;
	asyncActionSuccess: string;
	attendeeListAccepted: string;
	attendeeListDeclined: string;
	attendeeListNoReply: string;
	attendeeListTentative: string;
	close: string;
	commandDescription: string;
	commandTitle: string;
	dataTableAll: string;
	dataTableAscending: string;
	dataTableClear: string;
	dataTableColumns: string;
	dataTableDescending: string;
	dataTableDetail: string;
	dataTableEmpty: string;
	dataTableFilters: string;
	dataTableSelectAll: string;
	dataTableSelected: string;
	dataTableSort: string;
	dataTableSortBy: string;
	dataTableToggleColumns: string;
	datePickerClear: string;
	datePickerPlaceholder: string;
	dotMatrixLabel: string;
	messageScrollerEnd: string;
	messageScrollerStart: string;
	questionnaireNext: string;
	questionnairePrevious: string;
	questionnaireSkip: string;
	questionnaireSubmit: string;
	reasoningLabel: string;
	reasoningThinking: string;
	skeletonSwapLoaded: string;
	sortableListReorder: string;
	spinnerLabel: string;
	suggestionAccept: string;
	suggestionDismiss: string;
	tablePaginationEmpty: string;
	tablePaginationNext: string;
	tablePaginationPrevious: string;
	tablePaginationRange: string;
	threadMessageEmpty: string;
};

export const DEFAULT_UI_STRINGS: UiStrings = {
	asyncActionError: "Try again",
	asyncActionSuccess: "Done",
	attendeeListAccepted: "Accepted",
	attendeeListDeclined: "Declined",
	attendeeListNoReply: "No reply",
	attendeeListTentative: "Maybe",
	close: "Close",
	commandDescription: "Search for a command to run...",
	commandTitle: "Command Palette",
	dataTableAll: "All",
	dataTableAscending: "Ascending",
	dataTableClear: "Clear",
	dataTableColumns: "Columns",
	dataTableDescending: "Descending",
	dataTableDetail: "Detail",
	dataTableEmpty: "No results found.",
	dataTableFilters: "Filters",
	dataTableSelectAll: "Select every row on this page",
	dataTableSelected: "selected",
	dataTableSort: "Sort",
	dataTableSortBy: "Sort by",
	dataTableToggleColumns: "Toggle columns",
	datePickerClear: "Clear",
	datePickerPlaceholder: "Select a date",
	dotMatrixLabel: "Loading",
	messageScrollerEnd: "Scroll to end",
	messageScrollerStart: "Scroll to start",
	questionnaireNext: "Next",
	questionnairePrevious: "Previous",
	questionnaireSkip: "Skip",
	questionnaireSubmit: "Submit",
	reasoningLabel: "Reasoning",
	reasoningThinking: "Thinking…",
	skeletonSwapLoaded: "{label} loaded",
	sortableListReorder: "Reorder {label}",
	spinnerLabel: "Loading",
	suggestionAccept: "Accept",
	suggestionDismiss: "Dismiss",
	tablePaginationEmpty: "No results",
	tablePaginationNext: "Next",
	tablePaginationPrevious: "Previous",
	tablePaginationRange: "Showing {start}–{end} of {total}",
	threadMessageEmpty: "No message body.",
};

export const DEFAULT_UI_LOCALE = "en-US";

export type UiStringsContextValue = {
	strings: UiStrings;
	locale: string;
};

export const UI_STRINGS_DEFAULTS: UiStringsContextValue = {
	strings: DEFAULT_UI_STRINGS,
	locale: DEFAULT_UI_LOCALE,
};

export const UiStringsContext =
	createContext<UiStringsContextValue>(UI_STRINGS_DEFAULTS);

const PLACEHOLDER = /\{(\w+)\}/g;

export function fillUiString(
	template: string,
	values: Record<string, string | number>,
): string {
	return template.replace(PLACEHOLDER, (match, name: string) => {
		const value = values[name];
		return value === undefined ? match : String(value);
	});
}

export function mergeUiStrings(strings?: Partial<UiStrings>): UiStrings {
	if (!strings) return DEFAULT_UI_STRINGS;
	const merged = { ...DEFAULT_UI_STRINGS };
	for (const [key, value] of Object.entries(strings)) {
		if (typeof value === "string" && key in merged) {
			merged[key as keyof UiStrings] = value;
		}
	}
	return merged;
}
