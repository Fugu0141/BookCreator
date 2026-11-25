# BookCreator — Typography and font resources (design draft)

This document extends COMPONENT_SYSTEM and PROJECT_FORMAT; it does not change their published schema until the relevant fixtures pass.

## Defaults and separate concerns

- UI and source editor: Noto Sans JP by default; editor family/size/line height are local preferences, not book content. Monospace is an alternative for source editing. Editor settings never invalidate publication layout.
- New book default theme: Noto Sans JP body 400, headings 700 (different sizes per level); allow Noto Serif JP and a monospaced code face as optional packages later. Existing theme values must not be overwritten. Current preview exposes body/heading independently; it does not persist them yet. System generic faces are exploratory and not deterministic across devices.
- Roles: body, heading.1…6, caption, footnote, quote, code, inline-code, table, math, page-number, running-header, toc, bibliography, component text slots. A role may inherit a base text style. Body/heading are the only currently implemented book roles.
- Cascading: application new-project default → parent theme → current theme role → component variant/slot → explicit block override → explicit inline run override. Missing values inherit; reset removes the override. Font identity is independent of size, weight, style, language, line height, letter spacing and OpenType features. A block/inline override should be explicit and reversible, not arbitrary CSS. Do not copy a whole role definition to each manuscript block.

## Resource catalog (proposed schema, not yet parsed)

Project manifest references a font catalog (e.g. fonts/catalog.yaml); roles refer only to catalog IDs. Each family entry contains stable ID, display name, face list, weight range/style, source type (bundled/project/system), immutable content SHA-256, face index (collections later), declared license and allowed uses. For project files use relative paths under fonts/ and explicit license metadata. Bundled entries have an immutable app-supplied asset identifier and hash. Do not treat display name as identity, and do not overwrite a face with different bytes. Exact keys and migration rules require schema review.

Role example (illustrative): body {font: noto-sans-jp, weight: 400}; heading.1 {font: noto-sans-jp, weight: 700}; code {font: project-mono, weight: 400}. A future BCM local override uses a registered font ID and typed weight, subject to cross-repository agreement; do not add syntax to BCM silently. GUI can choose from the catalog per role, text component or selected block/run and shows inherited versus explicit values.

## Import and licensing

1. User explicitly selects a local TTF/OTF file; WOFF2 support can follow after validation; TTC/OTC, variable axes beyond weight, color and math fonts need separate tests. System-font discovery is optional and no automatic download. Never expose arbitrary filesystem or font URLs to renderer.
2. Main reads bounded regular files, validates magic, SFNT/table bounds and internal metadata via an audited parser in an isolated worker; reject malformed or unsupported files. Validate family/subfamily, weight range, style, cmap coverage and OS/2 fsType. fsType is a technical signal, not a license grant. Require the user to confirm editing, copying/redistribution, and PDF embedding rights separately; preserve license text and attribution. Unknown rights block redistributable project export or embedding, not necessarily local viewing.
3. For redistributable project assets, copy with explicit approval into fonts/ using content-based names, hash and record provenance; retain original bytes and license. For local-only fonts keep a local binding outside shared project, record unresolved dependencies for other collaborators. No background network fetching, upload, OS installation or automatic commit. Reject symlink escapes and collision; do not follow untrusted CSS or remote references.
4. Register the verified bytes in a trusted font runtime using opaque CSS family aliases (BCFont_…); only main-authorized resources can reach renderer, no raw file path. Wait for actual face load; missing assets/errors block formal output and display a diagnostic. For bundled Noto Sans JP, pinned Fontsource WOFF2 subsets and OFL notice are served locally; alias is a CSS identifier only, font binaries are not modified.

## Layout reproducibility

Measure and render with exactly the same resolved face/style/weight, fallback order, language, feature settings and environment. Include all font byte hashes, face indices, axes, style and fallback rules, font resolver/runtime/browser versions, OS and locale in layout fingerprint. Invalidate layout for book style/resource changes; not for source editor preferences. When a face cannot be resolved or a glyph is absent, diagnose with source range and requested font; no silent substitution for formal publication. Define explicit fallback chains (Japanese/Latin/math/emoji etc.) and record actual face selections. Current browser FontFaceSet.load only confirms matching loaded faces, not complete per-glyph coverage or exact variable axes. Generic OS fonts cannot authorize reproducible output. Font fingerprint in this PoC covers bundled files and preview role settings, not all environment details.

## PDF and acceptance

Use the same measured/confirmed PagePlan and face hashes for HTML and PDF. Check actual embedded/subset fonts and glyph mappings, disallow restricted embedding or missing fonts; do not silently rasterize text. Imported fonts may not be redistributable in the project even if document embedding is permitted. License audit is a release gate separate from application license. Keep the font license in generated packages, not manuscript text.

Fixtures: FNT-01 offline bundled face load; FNT-02 independent body/heading/slot roles; FNT-03 role change invalidates old plan; FNT-04 editor preference does not invalidate; FNT-05 import invalid font and restricted path; FNT-06 duplicate hashes/name collision; FNT-07 missing font/coverage/explicit fallback; FNT-08 theme and override round trip/Undo; FNT-09 PDF embedding policy; FNT-10 cross-OS identical asset and environment diagnostics. Initial implementation covers part of 01–04 only. Import and persistence are not yet implemented.
