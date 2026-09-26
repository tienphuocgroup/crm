import { schemas } from "@crm/validation";
import { z } from "zod";

export const zaloTokenResponse = schemas.messaging.zaloTokens;
export const zaloOaProfileResponse = schemas.messaging.zaloOaProfileResponse;

export const zaloPkceValue = z.object({
	verifier: z.string().min(43).max(128),
	userId: z.string().min(1),
	returnTo: z.string().min(1),
});

const returnToPath = z
	.string()
	.min(1)
	.max(512)
	.refine(
		(value) => !value.includes("#") && !value.includes("?"),
		"returnTo must carry no query and no fragment.",
	);

export const zaloConnectQuery = z.object({
	returnTo: returnToPath.optional(),
});

export const zaloCallbackQuery = z.object({
	code: z.string().trim().min(1).optional(),
	oa_id: z.string().trim().min(1).optional(),
	state: z.string().trim().min(1).optional(),
});

export type ZaloPkceValue = z.infer<typeof zaloPkceValue>;
export type ZaloTokenResponse = z.infer<typeof zaloTokenResponse>;
export type ZaloOaProfileResponse = z.infer<typeof zaloOaProfileResponse>;
