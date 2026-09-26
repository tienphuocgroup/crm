import { describe, expect, it } from "bun:test";
import { ActivityType } from "@crm/db/enums";
import { activityIcon, activityLabelKey } from "@/lib/activity-presentation";

describe("activity presentation", () => {
	it("gives MESSAGE an icon", () => {
		expect(activityIcon(ActivityType.MESSAGE)).toBeDefined();
	});

	it("gives MESSAGE a catalog key", () => {
		expect(activityLabelKey(ActivityType.MESSAGE)).toBe("activityTypeMessage");
	});

	it("covers every activity type", () => {
		for (const type of Object.values(ActivityType)) {
			expect(activityLabelKey(type).length).toBeGreaterThan(0);
		}
	});
});
