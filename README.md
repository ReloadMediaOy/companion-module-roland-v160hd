# Roland V-160HD — community test build

**Version 2.5.1-beta.1** is an unofficial ReloadMediaOy build for **Bitfocus Companion 5.x**. Download the [module package from the release](https://github.com/ReloadMediaOy/companion-module-roland-v160hd/releases/tag/v2.5.1-beta.1) and follow the [installation guide](COMMUNITY-TESTING.md).

This build packages the broad **2.5.0 implementation at [`757da28`](https://github.com/roopeberg/companion-module-roland-v160hd/tree/757da284994835383262349c7efd998ed89cac91)**. The beta version adds identification and documentation; its runtime JavaScript and dependency lockfile are unchanged. The capabilities and corrections below were already in that implementation. Some have also reached the official Bitfocus module separately, so this is not a list of differences from every current official release.

- [Feature support and known limitations](FEATURE-SUPPORT.md)
- [Test evidence and device test checklist](TESTING.md)
- [Report a bug or a test result](https://github.com/ReloadMediaOy/companion-module-roland-v160hd/issues/new/choose)

## Before testing

Use Companion 5.x with module API 2.1.3 / Node 22 support. The module's inherited firmware minimum is 1.04, but this is not a tested firmware support matrix: the supplied Reference Manual describes version 3.50 and later, and individual features depend on firmware. Record your version when testing. Back up your Companion configuration and use a test setup. The switcher accepts one TCP control connection at a time; close other Companion/RCS connections.

**Re-enter Password and click Save** after upgrading or importing a connection. This runtime reads Companion's separate secret storage, but its upgrade scripts do not migrate older saved passwords.

Two source-versus-manual discrepancies remain in the published runtime: the dedicated **CUT Take / AUTO Take** actions use different addresses from Roland's panel-switch commands, and **DSK Capture / Apply** uses inconsistent gain/mix addresses and lengths. Treat those paths as requiring correction and device verification; do not rely on them for a production take or a faithful DSK restore. Details and the separately implemented generic panel-switch controls are in [FEATURE-SUPPORT.md](FEATURE-SUPPORT.md#known-implementation-discrepancies).

**Field report — 2026-10-29:** A user reports that **CUT Take does not work in version 2.5**. This is a user-reported device failure, not an independent reproduction or a verified fix. The exact module patch/build, firmware and detailed reproduction steps were not supplied. The report is consistent with the CUT address discrepancy; it does not confirm an AUTO Take failure.

## Communication and polling

### Receiving messages and establishing a connection

The TCP parser buffers incomplete messages and separates messages that arrive together. It processes semicolon/newline delimiters in arrival order and recognizes authentication prompts without a trailing newline. The password is sent once per connection in response to the prompt; that send's log message omits the password value.

After authentication, the module requests version information, enables tally notifications and reads **40 source labels**, including when regular polling is disabled. Those label reads are 40 separate eight-byte requests. TCPHelper handles reconnect attempts with a configured 30-second interval. Explicit connection replacement stops the old polling loop and clears queued work; listeners ignore events from a replaced socket. This does not establish complete recovery of cached state or pending work across every automatic reconnect scenario.

### Prioritizing controls over reads

Normal control actions using `sendCommand` enter a high-priority queue. Consecutive sends from that queue are scheduled at least **20 ms apart**. When no high-priority command is waiting, up to **four low-priority commands** are sent per batch, with **5 ms between subsequent read batches**.

This reduces contention between button presses and polling. It does **not** guarantee immediate delivery or device acknowledgement. Priority is assigned explicitly: the login password bypasses the queue, and the tally-subscription command uses the low-priority path. The 20 ms rule therefore applies to high-priority sends, not every protocol write without exception.

The queue is pacing and prioritization, not complete congestion control: it has no maximum queue length, response-matched retry or adaptive backpressure. Heavy writes can delay reads; disconnected sends can be discarded. These cases still need documented device testing.

### Polling schedule

**Polling is off by default for a new connection.** Enable it for ongoing state reconciliation. The configuration's base-interval default is **1000 ms**. Numeric values are constrained to **300–30000 ms**; a missing or invalid value falls back to **500 ms**.

| Tier | Cadence | At 1000 ms | At 500 ms | Read requests per occurrence | State requested |
|---|---|---|---|---:|---|
| Fast | Every tick | 1 s | 0.5 s | 7 | Four PiP/Key tally blocks; PGM/PVW and AUX1–3 sources |
| Medium | Every second tick | 2 s | 1 s | 4 | AUX1–3 mute and one memory-slot name |
| Background | Every tenth tick | 10 s | 5 s | 10 | Four PiP sources, Freeze, HDMI/SDI output assignments, AUX link mode/states, transition settings and MONITOR switch assignments |

The regular schedule averages **10 read requests per base tick**: `7 + 4/2 + 10/10`. That is about **10 requests/s at 1000 ms**, or **20 requests/s at 500 ms**. These are code-derived scheduling estimates, not measured bandwidth or guaranteed response times. Startup, actions, label refreshes, INPUT-assignment resolution and notification-triggered reads add traffic; duplicate source-refresh suppression can reduce it.

When polling starts, all three tiers are requested once immediately. Responses still arrive asynchronously; the module does not wait for a complete state snapshot before the first timer tick.

### Fewer requests and clearer refresh behavior

Adjacent registers are read in blocks where implemented: Freeze (18 bytes: global On/Off, type and **16 physical input selections**), PGM/PVW, AUX2/3 sources, six HDMI/SDI output assignments, transition settings, MONITOR switch assignments, AUX link states and each PiP tally pair. A memory name is one eight-byte request rather than eight separate character reads.

- **Memory names:** one slot per medium tick, rotating through 30 slots. A full cycle is approximately **60 seconds at 1000 ms**, or **30 seconds at 500 ms**. There is no bulk startup load of all 30 names. Saving a memory restarts the cycle index.
- **Bus-source refresh:** requests within 250 ms of the previous source refresh are suppressed to reduce duplicate reads caused by actions and tally notifications.
- **Button/variable refresh:** parser-driven updates use a 40 ms trailing debounce to combine closely spaced messages. This is separate from the network polling interval.
- **Source labels:** read after authentication, by **Refresh Source Labels**, and by readback after **Set Device Label**. They are not continually polled. After renaming on the switcher, refresh or reconnect.
- **INPUT assignments:** requested on demand when uncached; all 20 assignments are queried after an Assign Input action. They are not part of the regular tier table.

Some controls update their displayed state locally before device confirmation. This is provisional feedback, not an acknowledgement. In this beta, Freeze writes directly into the local state cache; it does not have the later upstream work's bounded pending-state timeout. Direct PGM/PVW select actions request readback instead of performing the same optimistic cache update. Keep polling enabled for continuing reconciliation.

## Capabilities included in this build

| Area | What is available |
|---|---|
| Bus selection and tally | PGM/PVW and AUX1–3 source controls, independent bus feedback and combined multi-tally presets |
| INPUT/XPT | Logical slots 1–20, physical-source assignment lookup and choices in relevant bus/PiP/DSK controls; panel-mode combinations still require testing |
| Source names | 40 device-label variables, explicit refresh, and Set Device Label with write/readback; physical-source presets can show dynamic names |
| Freeze | Global On/Off, All/Select type, HDMI1–8 and SDI1–8 selections, plus the Set Freeze modifier and combined input presets |
| PiP/Key | Four channels with source/type, geometry, crop/view, border and key controls; capture/apply covers a subset of parameters |
| DSK | Key/fill source, type and bus controls for two channels; partial capture/apply with the known discrepancy noted above |
| Snapshots | Local JSON save/load/delete and applying captured parameter subsets; not a complete switcher backup |
| Memory | Exposed recall/save operations, names for slots 1–30 and last-loaded memory feedback |
| Transitions and panel controls | Mix/wipe settings, generic panel press/release and macro execution; dedicated CUT/AUTO actions need correction/verification |
| Routing | HDMI/SDI/USB output assignment controls, AUX mute/link, and assignments for the four MONITOR buttons |
| Cameras | Exposed PTZ, focus, exposure-mode, camera-preset and tally-channel commands; **not tested by this build's publisher**; each camera/setup needs testing |
| Companion interface | API 2.x variables, layered presets, bus indicators and source-type styling |

Physical HDMI/SDI/Still presets can use device labels. INPUT/XPT presets retain fixed `INPUT N` text; existing manually labelled buttons are not rewritten. The MONITOR1–4 controls assign the device's monitor-selection buttons, not four independent physical video outputs.

## Corrections carried by the original 2.5.0 implementation

| Correction | Practical effect and boundary |
|---|---|
| Streaming TCP parsing and prompt recognition | Handles fragmented/combined messages and prompts without a newline; covered by parser unit tests |
| Write pacing across an empty queue | High-priority sends retain the 20 ms spacing check even when the queue was empty between them |
| Poll-loop and explicit teardown handling | Clears the old interval on configuration/connection replacement, discards queued work and ignores events from a replaced socket; broader reconnect testing remains open |
| Memory-name decoding | Decodes hexadecimal characters, removes NUL padding and presents last-loaded slot numbers as 1–30 |
| INPUT assignment resolution | Resolves logical slots to known physical sources for the relevant state/feedback paths; mode-dependent routing remains a device-test item |
| Source-label handling | Validates label responses, rejects an empty write, limits labels to eight printable ASCII characters, and requests readback after a write |
| PiP parameter reads and source presets | Corrects selected two-byte PiP read lengths and source-option wiring; this does not validate every PiP parameter or DSK snapshot |
| Error and credential handling | Recognizes protocol/login errors, guards repeated password sends on one connection, and uses a masked secret field; old-password migration is still missing |
| Reduced duplicate work | Debounces repeated source queries and parser-triggered feedback scans |

## What is tested, and what is not supported?

**113/113 automated tests passed on Node 22.23.1**, across parser, queue, block-response, source-label and INPUT-assignment tests. They use simulated data/sockets and are not comprehensive hardware qualification. Historical notes record only partial PiP device checks. Most other device workflows still need reproducible reports for this beta and the tester's firmware/setup.

**Camera testing context:** The publisher uses this V-160HD mainly with presentation computers rather than for camera production and has not tested its camera-control functions at all. PTZ movement, camera presets, focus, exposure-mode and camera-tally controls are implemented, but have not been device-validated by the publisher. Test reports from users with camera setups are welcome.

[FEATURE-SUPPORT.md](FEATURE-SUPPORT.md) separates implemented, partial and missing controls, including audio-mixer settings, video processing, multiview configuration, macro/sequence editing and device setup. [TESTING.md](TESTING.md) lists the implemented functions that still need documented testing and the evidence already available. A feature needing testing is not automatically unsupported.

These branch documents are the current audited guidance. The published `.tgz` has not been rebuilt; its bundled HELP and the original release-tag documents predate these documentation corrections.

## Feedback and references

Use [GitHub Issues](https://github.com/ReloadMediaOy/companion-module-roland-v160hd/issues/new/choose): **Bug report** for one problem, **Test report** for successful or mixed results, and **Feature Request** for an improvement. Include module/Companion/firmware versions, operating system, steps and observed results.

Implementation references: [connection, polling and queue](src/api.js), [configuration defaults](src/config.js), [actions](src/actions.js), [TCP parser](src/tcpParser.js), [upgrade scripts](src/upgrades.js). Device references: [Roland Control Guide](manuals/V-160HD_Control_eng06_W.pdf), [Roland Reference Manual](manuals/V-160HD_Reference_eng09_W.pdf). License: [MIT](LICENSE).
