# ADR-0009: Media storage and safe uploads

- **Status:** Accepted
- **Date:** 2026-10-09
- **Deciders:** Hussien (owner), Claude (Lead Technical Owner)
- **Confirms:** D8
- **بالعربي:** الصور في R2 (وdisk محلي للتطوير) خلف interface واحد. كل رفع يُتحقق منه بالـ magic bytes ويُعاد ترميزه بـ sharp، ولا يُقبل SVG.

## Context
Product images drive conversion and Core Web Vitals, and uploads are a classic attack surface.

## Decision
- A `MediaStorage` interface with two drivers: local disk (development, tests) and S3-compatible (Cloudflare R2 in production). On 2026-10-08 R2's free tier was 10 GB-month, 1 million Class A and 10 million Class B operations per month, with no egress charge.
- Public serving from a separate cookieless domain with immutable cache headers and `X-Content-Type-Options: nosniff`.
- Upload rules: authenticated and permitted (`media:upload`); size and count caps and per-user quota; type detected from magic bytes, never from extension or Content-Type; allow-list JPEG, PNG, WebP (HEIC only if sharp supports it, verified in Phase 3); SVG and PDF rejected; always decode and re-encode with sharp (strips EXIF, GPS and hidden payloads), with `limitInputPixels` against decompression bombs; random storage keys, and the original filename kept only as a sanitized display label.
- Generate fixed variants (480, 960, 1600 px wide, WebP) and a dominant-color placeholder at upload time.
- Arabic alt text is required to publish (English optional).
- No antivirus scanner: re-encoding gives the protection we need without the operational cost.

## Options considered
- Local disk only: simplest, but needs its own backup and ties media to the server.
- Cloudinary or similar: on-the-fly transforms, but free-tier limits and vendor lock-in.
- Images in the database: rejected.

## Consequences
- Cheap, fast, safe media. Brand logos must be uploaded as raster images.

## Revisit when
On-the-fly image transforms are needed, or R2 usage exceeds the free tier.
