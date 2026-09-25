import { z } from "zod";

export const sendPayload = z.object({ messageId: z.string().min(1) });

export const tokenRefreshPayload = z.object({
	accountId: z.string().min(1),
	attempt: z.number().int().nonnegative().default(0),
});

export const identityProfilePayload = z.object({
	identityId: z.string().min(1),
});

export const zaloJson = z.json();

const flag = z.union([
	z.boolean(),
	z.number().transform((value) => value !== 0),
	z.string().transform((value) => value === "true" || value === "1"),
]);

export const zaloTokens = z.object({
	access_token: z.string().trim().min(1),
	refresh_token: z.string().trim().min(1),
	expires_in: z.coerce.number().int().positive(),
});

export const zaloErrorEnvelope = z.object({
	error: z.coerce.number().int(),
	message: z.string().optional(),
});

export const zaloOaProfile = z.object({
	oaid: z.coerce.string().trim().min(1),
	name: z.string().trim().min(1),
	avatar: z.string().trim().min(1).nullish(),
	is_verified: flag.nullish(),
});

export const zaloOaProfileResponse = z.object({
	error: z.coerce.number().int().optional(),
	message: z.string().optional(),
	data: zaloOaProfile,
});

export const zaloSentMessage = z.object({
	message_id: z.coerce.string().trim().min(1),
});

export const zaloSendResponse = z.object({
	error: z.coerce.number().int().optional(),
	message: z.string().optional(),
	data: zaloSentMessage,
});

export const zaloUserProfile = z.object({
	user_id: z.coerce.string().trim().min(1),
	display_name: z.string().nullish(),
	avatar: z.string().nullish(),
});

export const zaloUserProfileResponse = z.object({
	error: z.coerce.number().int().optional(),
	message: z.string().optional(),
	data: zaloUserProfile,
});

export type SendPayload = z.infer<typeof sendPayload>;
export type TokenRefreshPayload = z.infer<typeof tokenRefreshPayload>;
export type IdentityProfilePayload = z.infer<typeof identityProfilePayload>;
export type ZaloTokens = z.infer<typeof zaloTokens>;
export type ZaloErrorEnvelope = z.infer<typeof zaloErrorEnvelope>;
export type ZaloOaProfile = z.infer<typeof zaloOaProfile>;
export type ZaloSentMessage = z.infer<typeof zaloSentMessage>;
export type ZaloUserProfile = z.infer<typeof zaloUserProfile>;
