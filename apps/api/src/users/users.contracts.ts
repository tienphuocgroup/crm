import { z } from "zod";

export const SUPPORTED_USER_LOCALES = ["en", "vi"] as const;

export const setLocaleInput = z.object({
	locale: z.enum(SUPPORTED_USER_LOCALES),
});

export type SetLocaleInput = z.infer<typeof setLocaleInput>;
