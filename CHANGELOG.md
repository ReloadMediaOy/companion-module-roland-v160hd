# Changelog

## 2.5.1-beta.2 — community test build

Scoped runtime correction on top of the original 2.5.0 implementation and community beta.1:

- Correct the dedicated CUT Take and AUTO Take addresses to `0B001E` / `0B001F`.
- Queue `01` (press) then `00` (release) for every invocation through the existing high-priority FIFO, retaining at least 20 ms between sends and the order of repeated presses. No shared delayed-release timer is introduced.
- Remove CUT's optimistic cached PGM-source assignment. Source feedback follows device responses; both dedicated actions retain their source-refresh request.
- Preserve existing action/preset IDs. Generic panel actions, DSK snapshot mapping and other runtime behavior are unchanged.
- Add dedicated CUT/AUTO regression coverage. Validation: 124 automated tests passed in 24 suites on Node 22.23.1.
- Update the English guides and bundled HELP to distinguish the correction from device validation, and to retain the polling, camera-testing and partial-support limitations.

Real-device verification of CUT/AUTO, including acceptance of the nominal 20 ms pulse, remains pending. The earlier user report confirmed CUT failure on a version described as 2.5; it did not independently confirm AUTO failure. DSK snapshot gain/mix errors remain unresolved and are reserved for separate work. This build changes runtime code; the unchanged-runtime statement below applies only to beta.1.

## 2.5.1-beta.1 — 2026-10-29

Community testing distribution of the original 2.5.0 implementation at `757da284994835383262349c7efd998ed89cac91`.

- Add English installation and testing instructions.
- Identify the package as a ReloadMediaOy community test build and provide a community feedback route.
- Document password re-entry, source-name refresh, and separate transfer of Companion configuration and snapshot files.

The runtime JavaScript and dependency lockfile are unchanged. This release does not add the later upstream PR implementations or fix the legacy password migration limitation; it packages the original broad implementation for wider testing.

### Documentation follow-up — same package

- Direct feedback to GitHub Issues with Bug report, Test report and Feature Request forms.
- Audit and correct README communication/polling descriptions: configuration default, request counts, memory-name cadence, source-label refresh, queue limits and provisional local feedback.
- Add a feature-support matrix separating implemented, partial and missing dedicated controls from functions that need documented device testing.
- Describe the scope of the 113 automated tests and preserve the limited historical PiP evidence without extending it to unrelated functions.
- Record source-versus-manual discrepancies in dedicated CUT/AUTO actions and DSK snapshot gain/mix handling. These findings are documented, not fixed in this package.

The published `.tgz`, runtime code and release tag remain unchanged. Current branch documentation and release attachments supersede the original bundled HELP for these corrections.
