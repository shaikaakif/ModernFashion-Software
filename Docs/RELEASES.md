# Releases and auto-update

This document covers how the installed Modern Fashion POS checks GitHub Releases,
downloads a newer build, and installs it without touching shop data.

**Repository:** `shaikaakif/ModernFashion-Software` (public)
**Current release:** [`v1.2.4`](https://github.com/shaikaakif/ModernFashion-Software/releases/tag/v1.2.4), published 18 November 2026
**Previous releases:** `v1.2.3`, `v1.2.2`, `v1.2.1`, `v1.2.0` and `v1.1.0` remain available for rollback.
**Update provider:** `electron-updater` with the GitHub provider
**Installer:** electron-builder + NSIS, x64, per-user install

## 1. How the installed app updates

1. The app checks the public GitHub Releases feed about 15 seconds after startup,
   when the connection returns, and whenever the owner presses **Check now**.
2. If a newer stable version exists, the owner sees an update badge and a
   notification. The owner opens **Releases**, reviews the version and notes,
   then presses **Download update**.
3. **Restart & install** creates a verified SQLite backup first. If that backup
   fails, installation is blocked.
4. `electron-updater` starts the NSIS installer for the downloaded package. The
   installer replaces program files only.
5. The app reopens on the new version. The database, backups, exports, documents
   and settings remain in `%APPDATA%\Modern Fashion POS`.

Business operations never depend on GitHub. An internet connection is used only
for update checks and downloads.

## 2. Build a release locally

```powershell
npm run verify
npm run dist
```

`npm run verify` runs tests, the production renderer build and lint. `npm run dist`
writes these files to `release/`:

```text
ModernFashionPOS-Setup-<version>.exe
ModernFashionPOS-Setup-<version>.exe.blockmap
latest.yml
win-unpacked/
```

If Windows reports `EBUSY` for `release/win-unpacked/resources/app.asar`, an
editor, antivirus scanner or file preview still holds the old build. Close the
file/editor or delete `release/win-unpacked`, then rebuild. As a temporary
workaround, build to another folder and copy the installer files back:

```powershell
npx electron-builder --win nsis "-c.directories.output=release-final"
Copy-Item release-final\ModernFashionPOS-Setup-*.exe release\
Copy-Item release-final\ModernFashionPOS-Setup-*.exe.blockmap release\
Copy-Item release-final\latest.yml release\
```

`latest.yml` and the `.blockmap` are part of the update feed. Upload them with the
EXE. electron-builder also writes `app-update.yml` into the packaged resources so
the installed app knows where to look.

## 3. Publish a release

Publishing changes a public repository and must be approved by the owner first.
Never publish from the installed application. Use a build machine with a GitHub
token limited to this repository.

### Option A — electron-builder publisher

```powershell
$env:GH_TOKEN = "<token with repo release permission>"
npm run dist:publish
```

### Option B — GitHub CLI

```powershell
gh release create v1.1.0 `
  "release/ModernFashionPOS-Setup-1.1.0.exe" `
  "release/ModernFashionPOS-Setup-1.1.0.exe.blockmap" `
  "release/latest.yml" `
  --repo shaikaakif/ModernFashion-Software `
  --title "Modern Fashion POS 1.1.0" `
  --notes "Print and barcode configuration, release management, update safety."
```

Rules:

- Tag format is `v<version>` and must match `package.json`.
- The release must stay public. The installed app reads it without a token.
- Never upload only the EXE. Without `latest.yml` the updater cannot see the
  release.
- Do not mark a release as a draft after the update notice is sent; the feed will
  fail for installed clients.
- Keep older releases. They are the rollback path.

## 4. Code signing

The current NSIS installer is **not code-signed**. Windows SmartScreen may show
"Unknown publisher" on first install. Do not describe the installer as signed or
trusted-publisher verified until a code-signing certificate is configured and the
produced EXE shows the publisher name in Windows properties.

## 5. Data safety and rollback

| Item | Location | Replaced by installer? |
|---|---|---|
| Database | `%APPDATA%\Modern Fashion POS\modern-fashion.db` | No |
| Backups | `...\backups\` | No |
| Documents | `...\documents\` | No |
| Exports | `...\exports\` | No |
| Logs | `...\logs\` | No |
| Logo and local assets | `...\assets\` | No |
| Program files | `%LOCALAPPDATA%\Programs\Modern Fashion POS` | Yes |

`deleteAppDataOnUninstall` is `false`, so uninstalling does not delete shop data.

To roll back:

1. Uninstall the newer build.
2. Install the previous `ModernFashionPOS-Setup-<version>.exe`.
3. Restore the pre-update backup from **Settings → Backup & restore** only if
   the database itself needs to go back. Program rollback does not require a
   database restore.

## 6. Troubleshooting the update feed

| Message | Meaning | Action |
|---|---|---|
| "No published release was found for this build yet" | No public release with `latest.yml` exists for the installed version | Publish the release, then check again |
| "Could not reach GitHub Releases" | No internet, DNS or proxy failure | Confirm the connection; sales keep working offline |
| "Update checks run only in the installed application" | Running from source with `npm run dev` | Test updates from the installed EXE |
| Download stalls | Large installer on a slow link | Keep the app open; retry when the connection is stable |
| No update offered though a release exists | Version did not increase or update metadata is missing | Bump `package.json`, rebuild, re-upload EXE + `latest.yml` |

## 7. Acceptance checklist before telling the client "auto-update works"

- [x] `npm run verify` passes.
- [x] `npm run dist` produces the EXE, blockmap and `latest.yml`.
- [ ] A previous version is installed on a test PC.
- [x] The new release is published (`v1.2.4`) and appears in **Updates** within one check.
- [ ] Download reaches 100% and **Restart & install** creates a backup first.
- [ ] The app reopens on the new version.
- [ ] Products, sales history, customers, settings and the logo are unchanged.
- [ ] A manual backup created before the update verifies successfully.
- [ ] Offline billing still works with the network cable unplugged.

Until this checklist is completed on a real workstation, describe auto-update as
**implemented and locally verified**, not as accepted in production.
