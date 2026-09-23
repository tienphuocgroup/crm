const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;

export const MESSAGING_UI = {
	unreadPollMs: 30 * SECOND_MS,
	queuedPollMs: 2 * SECOND_MS,
	inboxPollMs: 10 * SECOND_MS,
	connectionStaleMs: 10 * MINUTE_MS,
	nearBottomPx: 80,
} as const;
