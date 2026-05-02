-- DiceBear avatar generator: stores style + seed (JSON) so the editor can restore the user's
-- choices next time. The generated SVG itself goes into User.avatar as a data: URI.

ALTER TABLE "User" ADD COLUMN "avatarConfig" TEXT;
