#!/bin/sh
# Boot entrypoint: ensure /data is writable by the oscarr user, then drop privileges.
# Handles three upgrade paths cleanly:
#   - fresh install                        → chown is a no-op (dir created in Dockerfile)
#   - existing volume from a pre-1001 image → chown fixes the ownership mismatch
#   - bind-mount from host                  → chown touches only the target dir, doesn't
#                                             cross the filesystem boundary
# `su-exec` hands PID 1 to node as oscarr so tini (ENTRYPOINT wrapper) continues to forward
# signals properly.
set -e

# Only attempt the chown if we're root — non-root containers (e.g. a user overriding
# the image's USER at runtime) skip it and trust the mount is already set up correctly.
if [ "$(id -u)" = "0" ]; then
  chown -R oscarr:oscarr /data || true
  # Plugins dir: ensure oscarr owns it AND set the setgid bit so any plugin dropped in by
  # the host maintainer (cp, git clone) inherits the right group, keeping both the host
  # admin and the in-container oscarr user able to write. `|| true` keeps boot resilient
  # against read-only bind-mounts or filesystems that don't support chown.
  if [ -d /app/packages/plugins ]; then
    chown -R oscarr:oscarr /app/packages/plugins 2>/dev/null || true
    chmod 2775 /app/packages/plugins 2>/dev/null || true
  fi
  exec su-exec oscarr:oscarr "$@"
fi

exec "$@"
