-- Email-auth UserProvider rows historically only carried `providerId` (the email) and left
-- `providerUsername` / `providerEmail` null, which surfaced as "—" in the Comptes liés UI.
-- Backfill from the linked User: providerEmail = User.email, providerUsername = User.displayName
-- (or email if no display name). New registrations write these directly via the auth route.

UPDATE "UserProvider"
SET "providerEmail" = (SELECT "email" FROM "User" WHERE "User"."id" = "UserProvider"."userId")
WHERE "provider" = 'email' AND "providerEmail" IS NULL;

UPDATE "UserProvider"
SET "providerUsername" = (
  SELECT COALESCE("displayName", "email") FROM "User" WHERE "User"."id" = "UserProvider"."userId"
)
WHERE "provider" = 'email' AND "providerUsername" IS NULL;
