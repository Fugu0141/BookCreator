# First development milestone (0.0.1)

Implemented: platform-neutral document revision guard and patch adapter contract, layout-result revision/fingerprint guard, full-plan requirement for review, and Q15 preview-release gate. This is not the complete application or publication state machine. React/Electron shell, actual BCM/Engine dependency integration, GUI, storage, rendering, Git and PDF are not yet implemented. The release checker only evaluates supplied check results and is not a substitute for performing the checks. Local Node 22.16.0 / TypeScript 5.8.3: six unit tests passed on the working copy. Full acceptance suite and integration tests not run. Network restrictions prevented npm installation and lockfile generation. Generate and commit package-lock.json and use npm ci before reproducible release. License is still undecided; no release.

## Second development milestone

Extended the pinned cross-repository smoke test with BCM nested component/heading ranges and a manually constructed measured row/stack/canvas heading tree. The fixture does not yet implement a production AST-to-layout compiler or actual text measurement. Six core and two integration tests passed locally; combined across repositories: 26/26. Source/test blob hashes were compared against GitHub. CI workflow pins updated library commits; remote CI results not verified. No lockfile, GUI, or release yet.

## Third milestone — manuscript pagination adapter PoC

Added compileMeasuredManuscript using injected BCM scanner and block ID index, plain ATX headings/plain paragraphs/leaf figure/any pagebreak only, explicit test measurement, origin preservation, and diagnostic rejection of unsupported blocks. This is not a full AST/theme/manifest compiler; no reference resolution, chapter numbering, resource I/O or actual text measurement. Outputs are never publication-ready. Added two cross-library tests and pinned experimental library commits. Tests/CI not yet verified.

Formal review guard now requires an explicit publicationReady=true in addition to revision/fingerprint/full plan. Legacy or experimental plans remain displayable but not formally reviewable; this guard is not itself publication validation.

## M03 continuation — schema/inspector integration

Compiler now requires the BCM partial schema validator and rejects its diagnostics before measurement. Added integration fixture for a rejected remote asset path and validated local figure width via Engine Inspector; CI pins updated to experimental library commits. Earlier core/integration CI including formal review guard succeeded. Latest integration fixture not yet verified. Full parser, semantic references, project-root/symlink checks, real measurement and GUI remain pending.

Review: previous core and integration checks succeeded. CI now pins merged BCM/Engine commits including BCM boundary/FIFO review fixes; latest combination requires re-verification. No formal release or publication readiness change.

## M04 — browser preview preparation

Separated semantic preparation from fixture measurement; introduced a restricted browser-preview request adapter for exact single-line source paragraphs and plain ATX headings, with source offsets and heading constraints. Unsupported features (figures, manual pagebreaks, multiline paragraphs) are diagnosed rather than silently omitted. No publication readiness. New integration tests pending.

Added loopback-only browser preview demo: text input, content dimensions, measured page rendering, exact source selection and stale result invalidation. No save, Electron/React, project files, theme editor, full Markdown, or publication output. Chrome integration smoke test pending.

## M04 — desktop workspace PoC

Added experimental Electron/React shell with a sandboxed renderer, allowlisted UI protocol and narrow IPC, book.yaml loading, ordered manuscript list, source edits, conflict-checked single-file saves and measured preview. Mixed line endings read-only. No full project creation, manifest editing, journal/recovery, actual book-wide theme/page preview, structural GUI, component editor or PDF. See DESKTOP_WORKSPACE_POC.md for limits. Unit and real Electron CI pending verification.

## M04 — font roles and bundled Noto Sans JP

Added independent preview body/heading family and weight settings; editor display separate. Locally bundled Noto Sans JP Variable with OFL notice and font asset fingerprint; default body 400/heading 700. No runtime network font download. Preview font changes invalidate layout. Generic fonts are environment-dependent; glyph coverage, project theme persistence, import, per-block overrides and PDF embedding not yet implemented. CI pending.

## M04 — new project and theme persistence

Desktop new-project form creates an exclusive child directory, book.yaml (written last), initial manuscript, theme, and resource directories. Existing paths never overwritten. Theme typography v1 stores stable font IDs and role weights, with optimistic hash checks and temp-file replacement. Existing theme metadata preserved semantically; YAML formatting may normalize. Separate source/theme dirty states; preview dimensions remain temporary. New project failure can leave a partial folder for manual recovery, not automatically deleted. No section management, font import, complete theme compiler, project lock/journal or multi-OS verification. CI pending.

## M04 — project font import

Added restricted static TTF/OTF import with SHA-256 per-face catalog, user rights/notice metadata, structural table checks, project-specific font protocol, sandboxed FontFace loading, font manager list/sample and independent font selection with persisted theme IDs. Real font fixture and Electron smoke verification added. No complete parser, glyph coverage, font collections, variable/italic, local-only fonts, deletion, PDF embedding or formal publication. CI pending.

## M04 — physical book composition

Added A4/A5/JIS B5 paper presets and physical margins, first interior side, manuscript ordering/start mode editing, conflict-checked manifest save, multi-manuscript preview including unsaved selected text, explicit pagebreak and alternating margins. Whole-book preview rejects unsupported cover/blank/physical-side starts and unsupported BCM. No creation/removal of additional sections, spread view, numbering, complete theme compilation or PDF. Cross-file fragment selection reports document ID rather than automatically switching. Snapshot is not a disk watcher; only preview. CI pending.
