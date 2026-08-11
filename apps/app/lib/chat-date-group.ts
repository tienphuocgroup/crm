const DAY_MS = 86_400_000;

export type ChatDateGroupKey = "today" | "yesterday" | "last7Days";

export function chatDateGroup(
	lastMessageAt: string,
	now: number,
): ChatDateGroupKey | null {
	if (!now) return null;

	const daysAgo =
		Math.floor(now / DAY_MS) -
		Math.floor(new Date(lastMessageAt).getTime() / DAY_MS);
	if (daysAgo <= 0) return "today";
	if (daysAgo === 1) return "yesterday";
	if (daysAgo <= 7) return "last7Days";
	return null;
}
