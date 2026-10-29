# Changelog

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
