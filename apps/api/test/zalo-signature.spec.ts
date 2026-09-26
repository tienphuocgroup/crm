import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import {
	verifyZaloSignature,
	zaloSignature,
} from "../src/messaging/zalo/zalo-signature";

const base = {
	appId: "app-1234",
	rawBody: JSON.stringify({ event_name: "user_send_text", timestamp: "1" }),
	timestamp: "1758470400000",
	secret: "oa-secret-key",
};

describe("the Zalo webhook signature", () => {
	it("is a plain sha256 over app id, body, timestamp and secret", () => {
		const expected = createHash("sha256")
			.update(base.appId + base.rawBody + base.timestamp + base.secret, "utf8")
			.digest("hex");

		expect(zaloSignature(base)).toBe(expected);
	});

	it("accepts the signature Zalo computes over the same bytes", () => {
		expect(verifyZaloSignature({ ...base, header: zaloSignature(base) })).toBe(
			true,
		);
	});

	it("accepts the signature in upper case", () => {
		expect(
			verifyZaloSignature({
				...base,
				header: zaloSignature(base).toUpperCase(),
			}),
		).toBe(true);
	});

	it("accepts the digest behind a mac= prefix", () => {
		expect(
			verifyZaloSignature({ ...base, header: `mac=${zaloSignature(base)}` }),
		).toBe(true);
		expect(
			verifyZaloSignature({
				...base,
				header: `MAC= ${zaloSignature(base).toUpperCase()}`,
			}),
		).toBe(true);
	});

	it("refuses a mac= prefix on the wrong digest", () => {
		expect(
			verifyZaloSignature({
				...base,
				header: `mac=${zaloSignature({ ...base, secret: "other" })}`,
			}),
		).toBe(false);
	});

	it("refuses a body that changed by one byte", () => {
		const header = zaloSignature(base);
		const tampered = `${base.rawBody.slice(0, -2)}0}`;

		expect(verifyZaloSignature({ ...base, rawBody: tampered, header })).toBe(
			false,
		);
	});

	it("refuses a signature made with the app secret when the OA key is set", () => {
		const header = zaloSignature({ ...base, secret: "app-secret" });

		expect(verifyZaloSignature({ ...base, header })).toBe(false);
	});

	it("refuses a missing header", () => {
		expect(verifyZaloSignature({ ...base, header: undefined })).toBe(false);
		expect(verifyZaloSignature({ ...base, header: null })).toBe(false);
		expect(verifyZaloSignature({ ...base, header: "" })).toBe(false);
	});

	it("refuses a header of the wrong length without throwing", () => {
		expect(verifyZaloSignature({ ...base, header: "abc" })).toBe(false);
		expect(
			verifyZaloSignature({ ...base, header: `${zaloSignature(base)}00` }),
		).toBe(false);
	});

	it("changes when the timestamp changes", () => {
		expect(zaloSignature(base)).not.toBe(
			zaloSignature({ ...base, timestamp: "1758470400001" }),
		);
	});
});
