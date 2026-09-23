import { parseAsString, parseAsStringLiteral } from "nuqs/server";

export const MESSAGING_FILTERS = ["all", "needsReply", "unmatched"] as const;

export type MessagingFilter = (typeof MESSAGING_FILTERS)[number];

export const MESSAGES_FILTER_PARAM = "filter";

export const MESSAGES_THREAD_PARAM = "thread";

export const messagesFilterParser =
	parseAsStringLiteral(MESSAGING_FILTERS).withDefault("all");

export const messagesThreadParser = parseAsString;
