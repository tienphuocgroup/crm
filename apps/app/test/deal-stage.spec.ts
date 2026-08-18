import { describe, expect, it } from "bun:test";
import { DealStage } from "@crm/db/enums";
import { resolveDealStageLabel } from "../lib/deal-stage";

describe("what the sheet calls a stage", () => {
	it("has a catalog key for every stage the column can hold", () => {
		const keys = Object.values(DealStage).map((stage) => {
			const label = resolveDealStageLabel(stage);
			return label.known ? label.labelKey : null;
		});

		expect(keys).toEqual([
			"stageInquiry",
			"stageConsultBooked",
			"stageConsultDone",
			"stageProposalSent",
			"stageEnrolled",
			"stageLost",
		]);
	});

	it("carries the tone the rest of the row reads", () => {
		expect(resolveDealStageLabel(DealStage.INQUIRY)).toEqual({
			known: true,
			labelKey: "stageInquiry",
			tone: "neutral",
		});
		expect(resolveDealStageLabel(DealStage.ENROLLED)).toEqual({
			known: true,
			labelKey: "stageEnrolled",
			tone: "success",
		});
		expect(resolveDealStageLabel(DealStage.LOST)).toEqual({
			known: true,
			labelKey: "stageLost",
			tone: "error",
		});
	});

	it("still shows a stage the catalog never heard of", () => {
		expect(resolveDealStageLabel("NEGOTIATION")).toEqual({
			known: false,
			text: "Negotiation",
			tone: "neutral",
		});
		expect(resolveDealStageLabel("DECISION_MAKER_BOUGHT_IN")).toEqual({
			known: false,
			text: "Decision Maker Bought In",
			tone: "neutral",
		});
	});

	it("does not read a prototype key as a stage", () => {
		expect(resolveDealStageLabel("toString")).toEqual({
			known: false,
			text: "Tostring",
			tone: "neutral",
		});
		expect(resolveDealStageLabel("constructor").known).toBe(false);
		expect(resolveDealStageLabel("__proto__").known).toBe(false);
	});
});
