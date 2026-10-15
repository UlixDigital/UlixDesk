-- A rotation used to replace the token hash immediately. Two refreshes for the
-- same cookie (the document and a prefetch, or TimezoneSync's router.refresh)
-- could both pass the 15-minute check. The loser then looked signed out, and
-- the refresh route cleared the cookie. The replaced hash stays valid for a
-- short grace so the in-flight request is still this session.

ALTER TABLE "Session" ADD COLUMN "previousTokenHash" TEXT;
ALTER TABLE "Session" ADD COLUMN "previousTokenExpiresAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Session_previousTokenHash_key" ON "Session"("previousTokenHash");
