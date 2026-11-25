# First development milestone (0.0.1)

Implemented: platform-neutral document revision guard and patch adapter contract, layout-result revision/fingerprint guard, full-plan requirement for review, and Q15 preview-release gate. This is not the complete application or publication state machine. React/Electron shell, actual BCM/Engine dependency integration, GUI, storage, rendering, Git and PDF are not yet implemented. The release checker only evaluates supplied check results and is not a substitute for performing the checks. Local Node 22.16.0 / TypeScript 5.8.3: six unit tests passed on the working copy. Full acceptance suite and integration tests not run. Network restrictions prevented npm installation and lockfile generation. Generate and commit package-lock.json and use npm ci before reproducible release. License is still undecided; no release.

## Second development milestone

Extended the pinned cross-repository smoke test with BCM nested component/heading ranges and a manually constructed measured row/stack/canvas heading tree. The fixture does not yet implement a production AST-to-layout compiler or actual text measurement. Six core and two integration tests passed locally; combined across repositories: 26/26. Source/test blob hashes were compared against GitHub. CI workflow pins updated library commits; remote CI results not verified. No lockfile, GUI, or release yet.
