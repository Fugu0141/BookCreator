# Desktop workspace PoC — M04

This is an experimental implementation of the existing PLATFORM_ARCHITECTURE, PROJECT_FORMAT and EDITOR_TRANSACTIONS contracts, not a replacement.

## Scope

- apps/desktop: Electron main/preload/React renderer. Main owns file access and native project selection. Renderer uses a fixed open/read/save IPC contract; no arbitrary path, shell or network APIs. A private standard secure protocol serves only bundled trusted UI assets; remote requests, navigation, permissions and child windows denied. Context isolation, sandbox, disabled Node integration.
- Workspace loader accepts version 1 book.yaml and an explicit manuscript section list. YAML is bounded, rejects duplicate keys, tags, anchors/aliases and unsupported formats. Manifest, themes, covers and other metadata remain untouched. Only existing manuscript files can be written; no creation/reordering/deletion. Non-manuscript sections are displayed but disabled. Content preview uses temporary body dimensions, not the actual page/theme settings; only the earlier plain-text subset, one selected manuscript.
- Single-file save checks manifest and source SHA-256 before writing and again before replacement. Temporary file in same directory, fsync file, rename and cleanup; BOM and uniform LF/CRLF maintained. Mixed or legacy line endings are read-only, and invalid UTF-8 is refused. No backup/journal or multi-file atomicity. Unknown formats refused rather than opened in a future read-only viewer. No automatic Git commit. External change diagnostic retains unsaved text. Native dialog before closing an open workspace and confirmation before changing away from edited source.
- Path checks reject traversal, symlinks, linked files, duplicate/case-normalized paths. This is not an adversarial filesystem sandbox: check/rename has residual TOCTOU risk, parent components could be replaced concurrently, crash durability and platform-specific rename semantics are not established. Use a trusted local project only. Full project lock/recovery, watcher, arbitrary asset validation, cross-OS behavior, manifest schema and resource resolution are future work.
- Electron and React, yaml and esbuild are pinned directly; transitive lockfile not yet committed. No installer, publishing, component editor, GUI structural editor, full BCM compatibility or PDF. No change to release gate Q15.

## Development

Build the three sibling repositories at the CI pins first. Then from BookCreator/apps/desktop:

    npm install
    npm test
    npm run build
    npm start

The desktop smoke test requires a GUI session (Linux CI uses xvfb-run). It creates a disposable project in a temporary directory, opens the React app in sandboxed Electron, exercises project open, source selection, actual measurement and saves. No user projects are touched. Tests and CI are initially pending; report actual status separately.
