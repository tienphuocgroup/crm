import type { IncomingMessage } from "node:http";

export type RawBody =
	| { ok: true; body: string }
	| { ok: false; reason: "too-large" | "unreadable" };

export class ParsedBodyError extends Error {
	override readonly name = "ParsedBodyError";
}

export function rawBody(
	request: IncomingMessage,
	limit: number,
): Promise<RawBody> {
	const captured = (request as { rawBody?: unknown }).rawBody;

	if (Buffer.isBuffer(captured)) {
		return Promise.resolve(
			captured.length > limit
				? { ok: false, reason: "too-large" }
				: { ok: true, body: captured.toString("utf8") },
		);
	}

	const parsed = (request as { body?: unknown }).body;

	if (parsed !== undefined && parsed !== null && !isEmptyBody(parsed)) {
		throw new ParsedBodyError(
			"A body parser read the Zalo webhook first and kept no raw buffer. The signature covers the wire bytes and a re-serialised object cannot be checked.",
		);
	}

	if (request.readableEnded || request.destroyed) {
		return Promise.resolve({ ok: false, reason: "unreadable" });
	}

	return new Promise((resolve) => {
		const chunks: Buffer[] = [];
		let size = 0;
		let settled = false;

		const finish = (value: RawBody) => {
			if (settled) return;
			settled = true;
			resolve(value);
		};

		request.on("data", (chunk: Buffer) => {
			size += chunk.length;
			if (size > limit) {
				request.destroy();
				finish({ ok: false, reason: "too-large" });
				return;
			}
			chunks.push(chunk);
		});

		request.on("end", () =>
			finish({ ok: true, body: Buffer.concat(chunks).toString("utf8") }),
		);
		request.on("error", () => finish({ ok: false, reason: "unreadable" }));
	});
}

function isEmptyBody(value: unknown): boolean {
	return (
		typeof value === "object" &&
		value !== null &&
		Object.keys(value).length === 0
	);
}
