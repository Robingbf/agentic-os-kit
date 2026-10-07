# Memory map

Master signpost. One file per area in `areas/`, one home per fact.
Check: `python3 memory-map/check.py` (format: see `memory-map/README.md`).

## Areas
<!--
One line per area, filled in by the setup. Absolute paths only:
  - [Label](/absolute/path/to/memory-map/areas/<area-id>.md): one-line description
The file name (<area-id>) must match an `id` in os.config.json "areas".
-->

## Archive
<!--
Optional. Point to a file listing finished or paused things:
  - [Archive](/absolute/path/to/memory-map/archive.md): finished or paused work
-->

## Scan roots
<!--
Optional. Folders whose direct sub-folders must each be listed in an area or the archive
(check.py reports the others as orphans). Never list an off_limits folder here.
  - [Projects folder](/absolute/path/to/your/projects): every project lives here
-->
