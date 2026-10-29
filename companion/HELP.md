# Roland V-160HD — community test build

**ReloadMediaOy community test build 2.5.1-beta.2.** This unofficial Companion 5.x build contains the original broad 2.5.0 implementation plus a scoped correction to dedicated CUT/AUTO actions. It is separate from the official Bitfocus module and later work prepared for that module.

Read the [installation guide](https://github.com/ReloadMediaOy/companion-module-roland-v160hd/blob/test/community-2.5.1-beta.2/COMMUNITY-TESTING.md), [communication and polling overview](https://github.com/ReloadMediaOy/companion-module-roland-v160hd/blob/test/community-2.5.1-beta.2/README.md), [feature-support matrix](https://github.com/ReloadMediaOy/companion-module-roland-v160hd/blob/test/community-2.5.1-beta.2/FEATURE-SUPPORT.md) and [device test checklist](https://github.com/ReloadMediaOy/companion-module-roland-v160hd/blob/test/community-2.5.1-beta.2/TESTING.md).

## Setup

Use Companion **5.x** with module API 2.1.3 / Node 22 support. The inherited firmware minimum is 1.04, but compatibility across firmware versions is not fully tested; the supplied Reference Manual describes version 3.50 and later. Record the firmware you use.

1. Import the supplied `roland-v160hd-2.5.1-beta.2.tgz` through **Modules → Import module package**. Keep the package compressed. The older beta.1 package does not contain the CUT/AUTO correction.
2. Select **2.5.1-beta.2** for the Roland connection, enabling the beta-version filter if necessary.
3. Enter the switcher's IP address. Control uses TCP port **8023**. A remote-control password must be configured on the switcher.
4. **Re-enter Password and click Save**, including when upgrading or importing an existing connection. Older saved passwords are not automatically migrated into Companion's separate secret storage.
5. Close other Companion/RCS connections to this switcher: it accepts one TCP control connection at a time.

Back up your Companion configuration and test before production use. The module package does not transfer your buttons, pages, connection settings or snapshot files. Export/import Companion configuration separately; snapshots are separate files on the Companion computer.

## Polling and source names

**Polling is disabled by default.** Enable it for ongoing reconciliation with device state. The configuration default is **1000 ms**; numeric values are constrained to **300–30000 ms**, and a missing or invalid value falls back to **500 ms**.

At 1000 ms, the fast/medium/background groups run every **1/2/10 seconds**. They cover bus sources and PiP tally, AUX mute and rotating memory names, and slower configuration state. All three groups are requested once when polling starts, but replies arrive asynchronously. The 30 memory names take about **60 seconds** for a full cycle at 1000 ms, or **30 seconds** at 500 ms.

Controls using the high-priority queue have at least **20 ms** between sends. Low-priority reads run in batches of up to four. This is prioritization and pacing, not complete congestion control or a delivery guarantee. Automatic reconnect and state recovery still need broader device testing.

The 40 source labels are read after authentication even with polling disabled. After a name is changed on the switcher, run **Refresh Source Labels**; names are not continually polled. **Set Device Label** writes up to **eight printable ASCII characters** and requests readback. Physical HDMI/SDI/Still presets can show dynamic labels; INPUT/XPT presets retain fixed `INPUT N` text. Existing manually labelled buttons keep their text.

## CUT/AUTO correction

The dedicated **CUT Take** and **AUTO Take** actions now use the documented `0B001E` / `0B001F` addresses. Each queues `01` (press), then `00` (release), through the existing high-priority FIFO. Find the red **CUT Take** and orange **AUTO Take** presets in the **Take** section. Existing buttons using these actions remain valid. Generic panel-switch actions retain their separate implementation.

CUT no longer guesses the PGM source from cached PVW state. Source feedback follows device responses, and both actions retain source-refresh requests. With AUTO, an immediate read can precede transition completion; check the actual output and final state.

**Hardware verification is still pending**, including acceptance of the nominal 20 ms pulse and repeated takes. Automated tests verify the generated sequence and local behavior, not the physical transition. The earlier user report confirmed CUT failure on a version described as 2.5; it did not independently confirm AUTO failure.

## Capabilities and limits

- Source selection and tally for PGM/PVW/AUX, INPUT1–20 assignment, source labels, output assignments and MONITOR button assignments are exposed. MONITOR1–4 are button/view assignments, not four physical outputs.
- Freeze includes global On/Off, All/Select, **16 physical input selections**, and the Set Freeze modifier. Releasing the modifier should return combined input buttons to normal PVW selection. This runtime uses optimistic cached Freeze state; it does not include the later upstream bounded pending-state implementation.
- PiP/Key1–4 and DSK1–2 expose multiple controls. Capture/apply and local snapshots cover **selected parameters only**, not every PiP/DSK setting or a whole-device backup. PiP capture includes 15 parameter entries; DSK capture includes nine.
- **DSK snapshot Gain/Mix mapping remains incorrect and unchanged in this build.** Do not rely on it for an accurate gain/mix restore. The support matrix records the address/length discrepancy and omitted settings.
- Snapshot JSON files are stored in `~/v160hd-snapshots/` on the Companion computer. Moving a module package or Companion configuration does not move these files.
- Camera movement, presets, focus, exposure-mode and tally controls exist, but **the publisher has not tested camera operation at all**: their V-160HD use focuses on presentation computers. Camera configuration must already exist on the device. Reports from camera users are welcome.
- Full audio processing, video-format/scaler controls, multiview configuration, macro/sequence editing and whole-device backup are among the functions without dedicated module controls. See the support matrix for exceptions and partial support.

A button indication alone is not proof that the device accepted a command. Check the real output and returned state, especially when testing optimistic feedback, delayed responses or reconnects.

## Report results

Use [ReloadMediaOy GitHub Issues](https://github.com/ReloadMediaOy/companion-module-roland-v160hd/issues/new/choose): **Bug report** for one problem, **Test report** for successful or mixed results, or **Feature Request** for an improvement. Include module/Companion/firmware versions, operating system, polling settings, steps and actual results. Remove passwords and sensitive information from logs and screenshots.

## Sponsored By

This module's availability to Companion was sponsored in part by: Lars Erik Pedersen <lars-erik@hotellteknikeren.no>, Jeremy Alysandratos <jjereonimo@gmail.com>, Roope Berg <roope.berg@reloadmedia.fi>, Eric Fetcho <fetcho@gmail.com>, and Gethin Davies <gethindavies@pm.me>
