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
