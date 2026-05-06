-- Adds the GitHub repository ("<owner>/<repo>") associated with a registry-installed
-- plugin. Used by the update checker to look up releases without re-deriving from the
-- plugin id (legacy short ids can't be derived back to a repo, so we persist the link
-- explicitly at install time).
ALTER TABLE "PluginState" ADD COLUMN "repository" TEXT;
