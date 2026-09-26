import { createHash, timingSafeEqual } from "node:crypto";

const HEADER_PREFIX = "mac=";

export type ZaloSignatureInput = {
	appId: string;
	rawBody: string;
	timestamp: string;
	secret: string;
};

export function zaloSignature(input: ZaloSignatureInput): string {
	return createHash("sha256")
		.update(
			`${input.appId}${input.rawBody}${input.timestamp}${input.secret}`,
			"utf8",
		)
		.digest("hex");
}

export function verifyZaloSignature(
	input: ZaloSignatureInput & { header: string | null | undefined },
): boolean {
	const expected = Buffer.from(zaloSignature(input), "utf8");
	const given = Buffer.from(headerDigest(input.header), "utf8");

	if (given.length !== expected.length) {
		timingSafeEqual(expected, expected);

		return false;
	}

	return timingSafeEqual(expected, given);
}

function headerDigest(header: string | null | undefined): string {
	const value = (header ?? "").trim().toLowerCase();

	return value.startsWith(HEADER_PREFIX)
		? value.slice(HEADER_PREFIX.length).trim()
		: value;
}
