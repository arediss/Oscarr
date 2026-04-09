# Known Limitations

## Sonarr/Radarr queue `importBlocked` not surfaced

**Status**: Not handled  
**Priority**: Low (plugin candidate)  
**Discovered**: 2026-04-09

Sonarr/Radarr queue items can have `trackedDownloadState: importBlocked` with `trackedDownloadStatus: warning`. This happens when:
- Release naming doesn't match the series (matched by ID via grab history)
- File permissions prevent import
- Disk space issues on target path

Oscarr currently treats `completed` queue items as finished downloads. It does not distinguish between `completed + imported` and `completed + importBlocked`. The user sees the download at 100% then it disappears, while the media never becomes available.

### Queue item fields of interest

```json
{
  "status": "completed",
  "trackedDownloadStatus": "warning",
  "trackedDownloadState": "importBlocked",
  "statusMessages": [
    {
      "title": "Release name",
      "messages": ["Human-readable reason for the block"]
    }
  ]
}
```

Possible `trackedDownloadState` values: `importing`, `importPending`, `importBlocked`, `failedPending`.

### Future plugin idea

A "Queue Health" plugin could:
- Poll `/api/v3/queue` and filter items with `trackedDownloadState === 'importBlocked'`
- Surface warnings in admin dashboard
- Send notifications to admins when items are stuck
- Offer a "force import" action via Sonarr/Radarr API (`POST /api/v3/command` with `name: ManualImport`)
