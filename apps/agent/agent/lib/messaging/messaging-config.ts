const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export const MESSAGING = {
	zalo: {
		refreshEveryMs: 6 * HOUR_MS,
		refreshAheadMs: 12 * HOUR_MS,
		requestTimeoutMs: 10 * SECOND_MS,
		transientRetryMs: [5 * MINUTE_MS, 30 * MINUTE_MS, 2 * HOUR_MS],
		endpoints: {
			token: "https://oauth.zaloapp.com/v4/oa/access_token",
			profile: "https://openapi.zalo.me/v2.0/oa/getoa",
			send: "https://openapi.zalo.me/v3.0/oa/message/cs",
			userDetail: "https://openapi.zalo.me/v3.0/oa/user/detail",
		},
	},
	receipts: { staleAfterMs: 7 * DAY_MS },
} as const;
