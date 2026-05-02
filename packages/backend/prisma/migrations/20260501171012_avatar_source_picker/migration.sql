-- Issue #169 — User-selectable avatar source picker.
-- User.avatarSource: null = legacy/auto, "none" = initials fallback, otherwise a linked provider id.
-- UserProvider.providerAvatar: avatar URL fetched from that provider, used to resolve User.avatar.

ALTER TABLE "User" ADD COLUMN "avatarSource" TEXT;
ALTER TABLE "UserProvider" ADD COLUMN "providerAvatar" TEXT;
