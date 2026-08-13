-- Guard: the stage rewrite below maps exactly seven values. Stop if the column holds anything else.
DO $$
DECLARE
  unmapped text;
BEGIN
  SELECT string_agg(DISTINCT "stage"::text, ', ')
  INTO unmapped
  FROM "deal"
  WHERE "stage"::text NOT IN (
    'DEMO_BOOKED',
    'QUALIFIED_TO_BUY',
    'UNQUALIFIED_TO_BUY',
    'DECISION_MAKER_BOUGHT_IN',
    'CONTRACT_SENT',
    'CLOSED_WON',
    'CLOSED_LOST'
  );

  IF unmapped IS NOT NULL THEN
    RAISE EXCEPTION 'deal.stage holds unmapped value(s): %', unmapped;
  END IF;
END
$$;

-- AlterEnum
CREATE TYPE "DealStage_new" AS ENUM (
  'INQUIRY',
  'CONSULT_BOOKED',
  'CONSULT_DONE',
  'PROPOSAL_SENT',
  'ENROLLED',
  'LOST'
);

ALTER TABLE "deal" ALTER COLUMN "stage" DROP DEFAULT;

ALTER TABLE "deal"
ALTER COLUMN "stage" TYPE "DealStage_new"
USING (
  CASE "stage"::text
    WHEN 'DEMO_BOOKED' THEN 'CONSULT_BOOKED'
    WHEN 'QUALIFIED_TO_BUY' THEN 'CONSULT_DONE'
    WHEN 'DECISION_MAKER_BOUGHT_IN' THEN 'CONSULT_DONE'
    WHEN 'CONTRACT_SENT' THEN 'PROPOSAL_SENT'
    WHEN 'CLOSED_WON' THEN 'ENROLLED'
    WHEN 'CLOSED_LOST' THEN 'LOST'
    WHEN 'UNQUALIFIED_TO_BUY' THEN 'LOST'
  END
)::"DealStage_new";

DROP TYPE "DealStage";

ALTER TYPE "DealStage_new" RENAME TO "DealStage";

ALTER TABLE "deal" ALTER COLUMN "stage" SET DEFAULT 'INQUIRY';

-- Backfill: stage names stored as text on the stage-change timeline entries.
UPDATE "activity"
SET "meta" = "meta" || jsonb_strip_nulls(
  jsonb_build_object(
    'from',
    CASE "meta"->>'from'
      WHEN 'DEMO_BOOKED' THEN 'CONSULT_BOOKED'
      WHEN 'QUALIFIED_TO_BUY' THEN 'CONSULT_DONE'
      WHEN 'DECISION_MAKER_BOUGHT_IN' THEN 'CONSULT_DONE'
      WHEN 'CONTRACT_SENT' THEN 'PROPOSAL_SENT'
      WHEN 'CLOSED_WON' THEN 'ENROLLED'
      WHEN 'CLOSED_LOST' THEN 'LOST'
      WHEN 'UNQUALIFIED_TO_BUY' THEN 'LOST'
    END,
    'to',
    CASE "meta"->>'to'
      WHEN 'DEMO_BOOKED' THEN 'CONSULT_BOOKED'
      WHEN 'QUALIFIED_TO_BUY' THEN 'CONSULT_DONE'
      WHEN 'DECISION_MAKER_BOUGHT_IN' THEN 'CONSULT_DONE'
      WHEN 'CONTRACT_SENT' THEN 'PROPOSAL_SENT'
      WHEN 'CLOSED_WON' THEN 'ENROLLED'
      WHEN 'CLOSED_LOST' THEN 'LOST'
      WHEN 'UNQUALIFIED_TO_BUY' THEN 'LOST'
    END
  )
)
WHERE "type" = 'STAGE_CHANGE'
  AND jsonb_typeof("meta") = 'object'
  AND (
    "meta"->>'from' IN (
      'DEMO_BOOKED', 'QUALIFIED_TO_BUY', 'UNQUALIFIED_TO_BUY',
      'DECISION_MAKER_BOUGHT_IN', 'CONTRACT_SENT', 'CLOSED_WON', 'CLOSED_LOST'
    )
    OR "meta"->>'to' IN (
      'DEMO_BOOKED', 'QUALIFIED_TO_BUY', 'UNQUALIFIED_TO_BUY',
      'DECISION_MAKER_BOUGHT_IN', 'CONTRACT_SENT', 'CLOSED_WON', 'CLOSED_LOST'
    )
  );

-- Backfill: stage names stored as text inside queued deal events.
UPDATE "agentTask"
SET "payload" = jsonb_set(
  "payload",
  '{data}',
  ("payload"->'data') || jsonb_strip_nulls(
    jsonb_build_object(
      'from',
      CASE "payload"->'data'->>'from'
        WHEN 'DEMO_BOOKED' THEN 'CONSULT_BOOKED'
        WHEN 'QUALIFIED_TO_BUY' THEN 'CONSULT_DONE'
        WHEN 'DECISION_MAKER_BOUGHT_IN' THEN 'CONSULT_DONE'
        WHEN 'CONTRACT_SENT' THEN 'PROPOSAL_SENT'
        WHEN 'CLOSED_WON' THEN 'ENROLLED'
        WHEN 'CLOSED_LOST' THEN 'LOST'
        WHEN 'UNQUALIFIED_TO_BUY' THEN 'LOST'
      END,
      'to',
      CASE "payload"->'data'->>'to'
        WHEN 'DEMO_BOOKED' THEN 'CONSULT_BOOKED'
        WHEN 'QUALIFIED_TO_BUY' THEN 'CONSULT_DONE'
        WHEN 'DECISION_MAKER_BOUGHT_IN' THEN 'CONSULT_DONE'
        WHEN 'CONTRACT_SENT' THEN 'PROPOSAL_SENT'
        WHEN 'CLOSED_WON' THEN 'ENROLLED'
        WHEN 'CLOSED_LOST' THEN 'LOST'
        WHEN 'UNQUALIFIED_TO_BUY' THEN 'LOST'
      END,
      'stage',
      CASE "payload"->'data'->>'stage'
        WHEN 'DEMO_BOOKED' THEN 'CONSULT_BOOKED'
        WHEN 'QUALIFIED_TO_BUY' THEN 'CONSULT_DONE'
        WHEN 'DECISION_MAKER_BOUGHT_IN' THEN 'CONSULT_DONE'
        WHEN 'CONTRACT_SENT' THEN 'PROPOSAL_SENT'
        WHEN 'CLOSED_WON' THEN 'ENROLLED'
        WHEN 'CLOSED_LOST' THEN 'LOST'
        WHEN 'UNQUALIFIED_TO_BUY' THEN 'LOST'
      END
    )
  )
)
WHERE "kind" = 'agent-event'
  AND "payload"->>'type' IN (
    'deal.stage.changed', 'deal.opened', 'deal.closed', 'deal.created'
  )
  AND jsonb_typeof("payload"->'data') = 'object'
  AND (
    "payload"->'data'->>'from' IN (
      'DEMO_BOOKED', 'QUALIFIED_TO_BUY', 'UNQUALIFIED_TO_BUY',
      'DECISION_MAKER_BOUGHT_IN', 'CONTRACT_SENT', 'CLOSED_WON', 'CLOSED_LOST'
    )
    OR "payload"->'data'->>'to' IN (
      'DEMO_BOOKED', 'QUALIFIED_TO_BUY', 'UNQUALIFIED_TO_BUY',
      'DECISION_MAKER_BOUGHT_IN', 'CONTRACT_SENT', 'CLOSED_WON', 'CLOSED_LOST'
    )
    OR "payload"->'data'->>'stage' IN (
      'DEMO_BOOKED', 'QUALIFIED_TO_BUY', 'UNQUALIFIED_TO_BUY',
      'DECISION_MAKER_BOUGHT_IN', 'CONTRACT_SENT', 'CLOSED_WON', 'CLOSED_LOST'
    )
  );

-- Guard: no stored stage string survives on an old value.
DO $$
DECLARE
  stale_activities bigint;
  stale_tasks bigint;
BEGIN
  SELECT count(*)
  INTO stale_activities
  FROM "activity"
  WHERE "type" = 'STAGE_CHANGE'
    AND (
      "meta"->>'from' IN (
        'DEMO_BOOKED', 'QUALIFIED_TO_BUY', 'UNQUALIFIED_TO_BUY',
        'DECISION_MAKER_BOUGHT_IN', 'CONTRACT_SENT', 'CLOSED_WON', 'CLOSED_LOST'
      )
      OR "meta"->>'to' IN (
        'DEMO_BOOKED', 'QUALIFIED_TO_BUY', 'UNQUALIFIED_TO_BUY',
        'DECISION_MAKER_BOUGHT_IN', 'CONTRACT_SENT', 'CLOSED_WON', 'CLOSED_LOST'
      )
    );

  SELECT count(*)
  INTO stale_tasks
  FROM "agentTask"
  WHERE "kind" = 'agent-event'
    AND "payload"->>'type' IN (
      'deal.stage.changed', 'deal.opened', 'deal.closed', 'deal.created'
    )
    AND (
      "payload"->'data'->>'from' IN (
        'DEMO_BOOKED', 'QUALIFIED_TO_BUY', 'UNQUALIFIED_TO_BUY',
        'DECISION_MAKER_BOUGHT_IN', 'CONTRACT_SENT', 'CLOSED_WON', 'CLOSED_LOST'
      )
      OR "payload"->'data'->>'to' IN (
        'DEMO_BOOKED', 'QUALIFIED_TO_BUY', 'UNQUALIFIED_TO_BUY',
        'DECISION_MAKER_BOUGHT_IN', 'CONTRACT_SENT', 'CLOSED_WON', 'CLOSED_LOST'
      )
      OR "payload"->'data'->>'stage' IN (
        'DEMO_BOOKED', 'QUALIFIED_TO_BUY', 'UNQUALIFIED_TO_BUY',
        'DECISION_MAKER_BOUGHT_IN', 'CONTRACT_SENT', 'CLOSED_WON', 'CLOSED_LOST'
      )
    );

  IF stale_activities > 0 OR stale_tasks > 0 THEN
    RAISE EXCEPTION 'stage backfill left % activity row(s) and % agentTask row(s) on an old value', stale_activities, stale_tasks;
  END IF;
END
$$;
