-- Quotation numbers are ULXQ plus the counter, with no separator: ULXQ2100, ULXQ2101.
-- Existing Q- numbers are rewritten in creation order, starting at ULXQ2100,
-- or after the highest ULXQ number already stored. Running this again is a no-op
-- once those Q- numbers are gone. Invoice numbers are not touched.

ALTER TABLE "WorkspaceSettings" ALTER COLUMN "quotationPrefix" SET DEFAULT 'ULXQ';
ALTER TABLE "WorkspaceSettings" ALTER COLUMN "nextQuotationNumber" SET DEFAULT 2100;

DO $$
DECLARE
  next_num integer := 2099;
  existing_max integer;
  rec record;
  new_number text;
BEGIN
  SELECT MAX(CAST(substring("number" FROM 5) AS integer))
    INTO existing_max
  FROM "Quotation"
  WHERE "number" ~ '^ULXQ[0-9]+$';

  IF existing_max IS NOT NULL AND existing_max > next_num THEN
    next_num := existing_max;
  END IF;

  FOR rec IN
    SELECT "id", "number"
    FROM "Quotation"
    WHERE "number" ~ '^Q-[0-9]+$'
    ORDER BY "createdAt" ASC, "id" ASC
  LOOP
    next_num := next_num + 1;
    new_number := 'ULXQ' || next_num::text;

    DELETE FROM "QuotationNumber" WHERE "number" = rec."number";
    INSERT INTO "QuotationNumber" ("number")
    VALUES (new_number)
    ON CONFLICT ("number") DO NOTHING;

    UPDATE "Quotation" SET "number" = new_number WHERE "id" = rec."id";
  END LOOP;

  INSERT INTO "QuotationNumber" ("number")
  SELECT q."number"
  FROM "Quotation" q
  WHERE q."number" ~ '^ULXQ[0-9]+$'
  ON CONFLICT ("number") DO NOTHING;

  UPDATE "WorkspaceSettings"
  SET
    "quotationPrefix" = 'ULXQ',
    "nextQuotationNumber" = GREATEST(
      2100,
      COALESCE((
        SELECT MAX(CAST(substring("number" FROM 5) AS integer)) + 1
        FROM "Quotation"
        WHERE "number" ~ '^ULXQ[0-9]+$'
      ), 2100)
    )
  WHERE "id" = 'workspace';
END $$;
