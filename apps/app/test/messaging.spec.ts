import { describe, expect, it } from "bun:test";
import {
	attachmentUrl,
	avatarUrl,
	blockedSendReason,
	contactName,
	externalIdSuffix,
	hasPendingSend,
	identityLabel,
	isAttachmentHost,
	mergeOptimistic,
	messageStatusKey,
	nameParts,
	requestIdLease,
	selectThread,
	threadLabel,
} from "@/lib/messaging";

describe("attachmentUrl", () => {
	it("upgrades an allowlisted http url to https", () => {
		expect(attachmentUrl("http://zdn.vn/photo.jpg")).toBe(
			"https://zdn.vn/photo.jpg",
		);
	});

	it("keeps an allowlisted https url", () => {
		expect(attachmentUrl("https://zalo.me/a/b.png")).toBe(
			"https://zalo.me/a/b.png",
		);
	});

	it("accepts a subdomain of an allowlisted host", () => {
		expect(attachmentUrl("https://f9-zpg.zadn.vn/x.jpg")).toBe(
			"https://f9-zpg.zadn.vn/x.jpg",
		);
	});

	it("refuses a host that only ends with the allowlisted text", () => {
		expect(attachmentUrl("https://evilzdn.vn/x.jpg")).toBeNull();
	});

	it("refuses an unlisted host", () => {
		expect(attachmentUrl("https://example.com/x.jpg")).toBeNull();
	});

	it("refuses a javascript url", () => {
		expect(attachmentUrl("javascript:alert(1)")).toBeNull();
	});

	it("refuses a data url", () => {
		expect(attachmentUrl("data:image/png;base64,AAAA")).toBeNull();
	});

	it("refuses text that is not a url", () => {
		expect(attachmentUrl("not a url")).toBeNull();
	});
});

describe("isAttachmentHost", () => {
	it("ignores case", () => {
		expect(isAttachmentHost("F9.ZaDn.Vn")).toBe(true);
	});

	it("refuses an unlisted host", () => {
		expect(isAttachmentHost("zalo.me.example.com")).toBe(false);
	});
});

describe("nameParts", () => {
	it("splits on the last space", () => {
		expect(nameParts("Mary Anne Smith")).toEqual({
			firstName: "Mary Anne",
			lastName: "Smith",
		});
	});

	it("leaves a single word as the first name", () => {
		expect(nameParts("Linh")).toEqual({ firstName: "Linh", lastName: "" });
	});

	it("collapses repeated spaces", () => {
		expect(nameParts("  Trần   Văn  An  ")).toEqual({
			firstName: "Trần Văn",
			lastName: "An",
		});
	});
});

describe("identityLabel", () => {
	it("uses the display name when Zalo sent one", () => {
		expect(
			identityLabel({ displayName: "Zalo An", externalId: "1234567890" }),
		).toEqual({ kind: "name", name: "Zalo An" });
	});

	it("falls back to the last four characters of the external id", () => {
		expect(
			identityLabel({ displayName: null, externalId: "1234567890" }),
		).toEqual({
			kind: "key",
			key: "messagingUnknownPersonWithId",
			params: { suffix: "7890" },
		});
	});

	it("treats a blank display name as missing", () => {
		expect(identityLabel({ displayName: "   ", externalId: "abcdef" })).toEqual(
			{
				kind: "key",
				key: "messagingUnknownPersonWithId",
				params: { suffix: "cdef" },
			},
		);
	});
});

describe("externalIdSuffix", () => {
	it("keeps a short id whole", () => {
		expect(externalIdSuffix("42")).toBe("42");
	});

	it("takes the last four characters", () => {
		expect(externalIdSuffix("  987654321  ")).toBe("4321");
	});
});

describe("threadLabel", () => {
	it("prefers the linked contact", () => {
		expect(
			threadLabel({
				contact: { firstName: "An", lastName: "Trần" },
				identity: { displayName: "Zalo An", externalId: "1234567890" },
			}),
		).toEqual({ kind: "name", name: "An Trần" });
	});

	it("falls back to the identity label", () => {
		expect(
			threadLabel({
				contact: null,
				identity: { displayName: null, externalId: "1234567890" },
			}),
		).toEqual({
			kind: "key",
			key: "messagingUnknownPersonWithId",
			params: { suffix: "7890" },
		});
	});
});

describe("contactName", () => {
	it("joins the parts it has", () => {
		expect(contactName({ firstName: "An", lastName: null })).toBe("An");
	});

	it("returns null for an empty contact", () => {
		expect(contactName({ firstName: null, lastName: null })).toBeNull();
	});
});

describe("avatarUrl", () => {
	it("upgrades an allowlisted avatar to https", () => {
		expect(avatarUrl("http://zalo.me/avatar.jpg")).toBe(
			"https://zalo.me/avatar.jpg",
		);
	});

	it("refuses an avatar on an unlisted host", () => {
		expect(avatarUrl("https://example.com/avatar.jpg")).toBeUndefined();
	});

	it("returns undefined for a missing avatar", () => {
		expect(avatarUrl(null)).toBeUndefined();
	});
});

describe("blockedSendReason", () => {
	it("returns the sentence of a refusal", () => {
		expect(
			blockedSendReason({
				data: { code: "UNPROCESSABLE_CONTENT" },
				message: "Zalo is disconnected.",
			}),
		).toBe("Zalo is disconnected.");
	});

	it("returns null for any other error", () => {
		expect(
			blockedSendReason({
				data: { code: "INTERNAL_SERVER_ERROR" },
				message: "The send failed inside the CRM.",
			}),
		).toBeNull();
	});

	it("returns null when the error carries no data", () => {
		expect(blockedSendReason({ message: "Failed to fetch" })).toBeNull();
	});
});

describe("mergeOptimistic", () => {
	it("appends a row the server has not returned yet", () => {
		expect(mergeOptimistic([{ id: "a" }], [{ id: "b" }])).toEqual([
			{ id: "a" },
			{ id: "b" },
		]);
	});

	it("drops an optimistic row once the server returns it", () => {
		expect(mergeOptimistic([{ id: "a" }, { id: "b" }], [{ id: "b" }])).toEqual([
			{ id: "a" },
			{ id: "b" },
		]);
	});

	it("returns the rows untouched when nothing is optimistic", () => {
		const rows = [{ id: "a" }];

		expect(mergeOptimistic(rows, [])).toBe(rows);
	});
});

describe("selectThread", () => {
	const listed = { id: "thread-1" };
	const older = { id: "thread-2" };

	it("returns null when no thread is selected", () => {
		expect(selectThread([listed], null, older)).toBeNull();
	});

	it("prefers the loaded row", () => {
		expect(selectThread([listed], "thread-1", older)).toBe(listed);
	});

	it("uses the fallback row when the list lacks it", () => {
		expect(selectThread([listed], "thread-2", older)).toBe(older);
	});

	it("refuses a fallback row for another thread", () => {
		expect(selectThread([listed], "thread-3", older)).toBeNull();
	});

	it("returns null when the fallback is missing", () => {
		expect(selectThread([listed], "thread-2", null)).toBeNull();
	});
});

describe("messageStatusKey", () => {
	it("maps a queued send to the sending label", () => {
		expect(messageStatusKey("QUEUED")).toBe("messagingStatusSending");
	});

	it("maps a sending row to the sending label", () => {
		expect(messageStatusKey("SENDING")).toBe("messagingStatusSending");
	});

	it("maps a sent row to the sent label", () => {
		expect(messageStatusKey("SENT")).toBe("messagingStatusSent");
	});

	it("maps a delivered row to the delivered label", () => {
		expect(messageStatusKey("DELIVERED")).toBe("messagingStatusDelivered");
	});

	it("maps a read row to the read label", () => {
		expect(messageStatusKey("READ")).toBe("messagingStatusRead");
	});

	it("gives a failed row no label, because the bubble shows the error", () => {
		expect(messageStatusKey("FAILED")).toBe("");
	});
});

describe("hasPendingSend", () => {
	it("returns false for an empty list", () => {
		expect(hasPendingSend([])).toBe(false);
	});

	it("returns true for a queued row", () => {
		expect(hasPendingSend([{ status: "SENT" }, { status: "QUEUED" }])).toBe(
			true,
		);
	});

	it("returns true for a sending row", () => {
		expect(hasPendingSend([{ status: "SENDING" }])).toBe(true);
	});

	it("returns false when every row settled", () => {
		expect(
			hasPendingSend([
				{ status: "SENT" },
				{ status: "DELIVERED" },
				{ status: "READ" },
				{ status: "FAILED" },
			]),
		).toBe(false);
	});
});

describe("requestIdLease", () => {
	function counter() {
		let count = 0;

		return () => {
			count += 1;

			return `id-${count}`;
		};
	}

	it("returns the same id for two submits before the send settles", () => {
		const lease = requestIdLease(counter());

		expect(lease.take()).toBe("id-1");
		expect(lease.take()).toBe("id-1");
	});

	it("mints a new id for the next send after the first settles", () => {
		const lease = requestIdLease(counter());

		expect(lease.take()).toBe("id-1");
		lease.settle();
		expect(lease.take()).toBe("id-2");
	});

	it("mints the first id lazily, on the first submit", () => {
		let minted = 0;
		const lease = requestIdLease(() => {
			minted += 1;

			return "id";
		});

		expect(minted).toBe(0);
		lease.take();
		expect(minted).toBe(1);
	});
});
