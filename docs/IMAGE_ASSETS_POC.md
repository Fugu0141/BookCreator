# Image assets PoC — M04

The first image increment is an asset catalog, not yet a layout node or publication renderer.

- Explicit native dialog imports static PNG after the user's copy/share confirmation. Original bytes are copied without rewriting, recompressing, or deleting the source.
- Project-relative storage: assets/images/<sha256>.png. Content hash is the stable resource ID; equal bytes deduplicate. Exclusive temporary file and no-overwrite hard-link publication, then remove temporary link. Existing damaged hash entries fail closed.
- Per-image limit 16 MiB, max 8192 pixels each dimension, 16 million pixels, 128 registered files. Chunk bounds, CRC, static IHDR encoding and IDAT/IEND structure are inspected. APNG is rejected. This is not full PNG conformance or a complete compressed-data validator; the sandboxed browser must decode the thumbnail separately.
- Project-scoped list and import IPC; renderer never supplies a file path. A local allowlisted image URL serves verified bytes for the active workspace only, with image/png, nosniff and no-store. External URLs remain denied. Reject symlinks, hard-linked files, invalid IDs and tampered bytes. Residual filesystem TOCTOU risk remains; trusted local projects only. No security claims beyond this restricted prototype.
- Catalog is reconstructed from content-addressed files on reopen; no additional manifest format or absolute asset paths. Imports persist immediately, independent of unsaved component drafts. There is no asset deletion yet. Confirmation is not proof of publication rights or a stored license record.
- Unit and Electron smoke tests cover valid PNG, CRC, dimension bounds, APNG, deduplication, tamper detection, path checks, user confirmation and actual thumbnail decoding. CI pending.

Next: neutral Layout Engine image node (explicit physical box, contain/cover, verified resource resolver), BookCreator theme image reference and component controls, measured preview/paper parity. Then JPEG/SVG policy, aspect lock, non-destructive crop, alt/accessibility, rights metadata, missing asset diagnostics and PDF output. No paper placement, crop, export or publication readiness in this increment.
