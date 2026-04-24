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
  exec su-exec oscarr:oscarr "$@"
fi

exec "$@"
