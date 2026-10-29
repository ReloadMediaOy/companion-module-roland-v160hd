# Roland V-160HD community test guide

**Version 2.5.1-beta.2** is an unofficial ReloadMediaOy build for Bitfocus Companion, based on the original 2.5.0 implementation at [commit `757da28`](https://github.com/roopeberg/companion-module-roland-v160hd/tree/757da284994835383262349c7efd998ed89cac91) plus a scoped CUT/AUTO correction. It includes source selection, tally feedback, dynamic source names, Freeze controls, PiP/DSK controls and partial snapshots. It is not an official Bitfocus release; testing on different hardware setups is still needed.

Read the [communication, polling and feature overview](README.md), [feature support and known limitations](FEATURE-SUPPORT.md), and [test evidence/checklist](TESTING.md) before testing. The dedicated CUT/AUTO addresses and press/release sequence are corrected in this build, but still need hardware verification. DSK capture/apply gain/mix handling is unchanged and retains its source-versus-manual discrepancy; do not rely on it for an accurate gain/mix restore.

## Requirements

- Companion **5.x**, with support for module API 2.1.3 and the Node 22 runtime.
- Roland V-160HD with a remote-control password configured. The inherited module minimum is **firmware 1.04**, but feature compatibility across firmware versions has not been fully tested; the supplied Reference Manual describes version 3.50 and later. Record the version you use.
- Network access from the Companion computer to the switcher.

Export a backup of your current Companion configuration before changing the module version. Try the build in a test setup before using it for a live production.

## Install the module

1. Download **`roland-v160hd-2.5.1-beta.2.tgz`** from the [release assets](https://github.com/ReloadMediaOy/companion-module-roland-v160hd/releases/tag/v2.5.1-beta.2). Keep it compressed; do not extract it or use GitHub's automatic source-code ZIP. The older beta.1 package does not contain this correction.
2. Open the browser interface of the Companion instance that will control the switcher. If Companion runs on another computer, you can open its interface over the network and upload the file from your own computer.
3. Open **Modules → Import module package** and select the `.tgz` file.
4. Open your **Roland V-160HD** connection and select module version **2.5.1-beta.2**. Enable the beta-version filter if needed to find it.
5. Check the switcher's IP address, enter its password and click **Save**. Enable polling for feedback and state updates.

The package includes the module and its presets. It does not include your existing buttons, pages, connection settings or saved snapshots. Transfer buttons and settings separately with Companion's export/import tools. Snapshot files are stored separately in `~/v160hd-snapshots/` on the Companion computer.

## Password and connection setup

**Re-enter the Password field and save it when upgrading an existing connection or transferring settings.** This version uses Companion's separate secret storage. An older saved password is not automatically migrated, which can cause an authentication error even when the old configuration worked.

The V-160HD accepts one TCP control connection at a time. Disable any other Companion connection to it and close Roland RCS before testing. A successful connection shows **OK** and logs **Authenticated.** Do not share your password in a test report.

## Names and presets

Add the presets supplied by this version to try its dynamic names and feedback. Existing buttons with manually entered text retain that text.

- **Set Device Label** writes a source name to the Roland. Choose a **Target** and enter a **Label**, then execute the action. Use up to **8 printable ASCII characters**, such as `CAMERA 1`; avoid accented characters.
- Names are read when the connection authenticates. After renaming a source on the Roland itself, execute **Refresh Source Labels**. Names are not continuously polled.
- Physical HDMI/SDI/Still source presets use dynamic labels. **INPUT/XPT 1–20** buttons still display fixed `INPUT N` text.

## Useful tests

Start by checking the corrected **CUT Take** and **AUTO Take** on a test setup with distinct PGM/PVW sources. Existing dedicated buttons retain their action/preset IDs and use the correction after selecting beta.2. Each now sends a complete press/release pair through the existing queue, with at least 20 ms between sends; hardware acceptance of that nominal pulse is still unverified. Check the real output, repeated presses and source feedback. Allow AUTO to finish before judging its final state. CUT no longer changes the displayed PGM source optimistically before a device response.

Use the [device test checklist](TESTING.md) to record source selection and tally feedback, names and refresh, Freeze controls, reconnection, and the other functions you use. Confirm that releasing **Set Freeze** returns the combined input buttons to normal PVW selection. Snapshot files contain only selected PiP/DSK parameters; check the [support limits and known discrepancies](FEATURE-SUPPORT.md) before attempting restore tests. Successful use of one function does not validate the whole module.

## Feedback

Submit feedback through [ReloadMediaOy GitHub Issues](https://github.com/ReloadMediaOy/companion-module-roland-v160hd/issues/new/choose).

- Choose **Bug report** for a problem. Report one problem per issue and include steps to reproduce it, the expected behavior and what actually happened.
- Choose **Test report** to share successful tests, partial results or failures on your setup. Describe what you tested and link any related bug reports.
- Choose **Feature Request** for a proposed improvement.

Search existing issues first and add related findings to the existing report where possible. The forms ask for your module version, Companion version, operating system and V-160HD firmware. Remove passwords and other sensitive information from screenshots and logs. Discussion in the tester group is welcome; GitHub keeps the findings and their resolution together.
