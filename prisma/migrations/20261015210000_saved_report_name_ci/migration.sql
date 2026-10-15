-- Names are unique per person regardless of case. The Prisma unique stays
-- case-sensitive; this index is what rejects "October" and "october".
--
-- Existing rows can already differ only by case. Creating the index first
-- fails with 23505. Keep the earliest row (createdAt, then id) and rename the
-- rest to "Name (2)", "Name (3)", and so on. A suffix that is already taken,
-- or that would pass 80 characters, takes the next free number.

DO $$
DECLARE
  rec record;
  suffix text;
  base text;
  candidate text;
  n integer;
BEGIN
  FOR rec IN
    SELECT id, "createdById", name
    FROM (
      SELECT
        id,
        "createdById",
        name,
        "createdAt",
        row_number() OVER (
          PARTITION BY "createdById", lower(name)
          ORDER BY "createdAt" ASC, id ASC
        ) AS rn
      FROM "SavedReport"
    ) ranked
    WHERE rn > 1
    ORDER BY "createdAt" ASC, id ASC
  LOOP
    n := 2;
    LOOP
      suffix := ' (' || n::text || ')';
      base := rec.name;
      IF char_length(base) + char_length(suffix) > 80 THEN
        base := left(base, 80 - char_length(suffix));
      END IF;
      candidate := base || suffix;
      EXIT WHEN NOT EXISTS (
        SELECT 1
        FROM "SavedReport"
        WHERE "createdById" = rec."createdById"
          AND lower(name) = lower(candidate)
          AND id <> rec.id
      );
      n := n + 1;
      IF n > 1000 THEN
        RAISE EXCEPTION 'saved report % could not be given a unique name', rec.id;
      END IF;
    END LOOP;
    UPDATE "SavedReport"
    SET name = candidate, "updatedAt" = CURRENT_TIMESTAMP
    WHERE id = rec.id;
  END LOOP;
END
$$;

CREATE UNIQUE INDEX "SavedReport_createdById_lower_name_key"
ON "SavedReport" ("createdById", lower("name"));
