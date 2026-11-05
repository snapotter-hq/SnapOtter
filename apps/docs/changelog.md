---
description: Release notes and version history for SnapOtter. See what's new, improved, and fixed in each release.
---

# Changelog {#changelog}

## Unreleased {#unreleased}

### Deprecated {#unreleased-deprecated}

- **The five image compress-to-size operations are deprecated.** `/api/v1/tools/image/compress-image-to-20kb`, `-50kb`, `-100kb`, `-200kb`, and `-500kb` are marked deprecated in the OpenAPI spec and will stay for at least one minor release. Send `POST /api/v1/tools/image/compress` with `settings` set to `{"mode":"targetSize","targetSizeKb":20}` (or 50, 100, 200, 500). The output is the same. The PDF preset paths are unchanged.

## v2.3.0 {#v2-3-0}

SnapOtter just passed one million image pulls across Docker Hub and GHCR, and 3,000 stars on GitHub. That's a lot of self-hosted servers, so this release is our thank-you to everyone running them.

Upgrade soon. 2.3.0 closes six security advisories, one of them high severity. Details are in the Security section below.

Beyond the fixes, there are new tools: a PDF Multi-Tool page editor, one-click compress-to-size presets for images and PDFs, and drag-and-drop page ordering in Organize PDF. OCR now reads Arabic, and pdf-to-text offers OCR when it hits a scanned PDF. SnapOtter can run under a subpath like `/snapotter` behind a reverse proxy. The app no longer needs a Postgres superuser to run. Admins who get locked out can recover from the command line. The rest is about 1,400 fixes, most of them for problems you reported.

> [!IMPORTANT]
> All six advisories below affect 2.2.0, and some reach back to 2.0.0. If you share an instance with other users or expose it beyond your own network, upgrade.

### Security {#v2-3-0-security}

- **SVG uploads could skip sanitization (GHSA-9c7h-xjrp-8gh3, high).** An SVG that the image decoder rejected was stored and served as-is instead of being sanitized. Affected: 2.2.0 and earlier. Reported by @xaferima. (#1211)
- **The job progress stream didn't check who was asking (GHSA-ff22-w6x2-fm98, medium).** It now requires sign-in and job ownership. Affected: 2.0.0 through 2.2.0. (#1750)
- **Result download links also served the original upload (GHSA-jgv3-2jc6-f628, medium).** Affected: 2.2.0 and earlier. Reported by @emirhancatkin. (#3623)
- **Passport photo and background effects trusted a client-supplied job id (GHSA-3c8g-8v4x-qq9j, medium).** Affected: 2.2.0 and earlier. Reported by @shaoyuuuuu. (#3623)
- **URL import, upload, and preview skipped role and API-key permission checks (GHSA-8xxr-g2w8-7f9r, medium).** Affected: 2.2.0 and earlier. Reported by @nguyenvantiennani. (#3780, #707)
- **SSO enforcement revealed the break-glass username (GHSA-q6fg-vvw9-cr8r, low).** A refused local login now gets the same 401 as any other failed login. Affected: 2.0.0 through 2.2.0. (#2148)
- **Postgres no longer runs as superuser.** The app now connects with a role that can only read and write data. Migrations use a separate, optional connection. See Upgrade Notes. (#918)
- **Patched dependencies**: dompurify and handlebars override floors raised to the fixed versions. (#4247)

### New Features {#v2-3-0-new-features}

- **PDF Multi-Tool**: a page editor that reorders, duplicates, rotates, and deletes pages, and pulls pages in from other PDFs. The server assembles the final file. (#1338)
- **Compress to a target size in one click**: five image presets (20, 50, 100, 200, 500 KB) and five PDF presets (100, 200, 500 KB, 1 MB, 2 MB). (#1250, #1377)
- **Run SnapOtter under a subpath**: set `BASE_PATH=/snapotter` and the same image serves from there. Result links, cookies, SSO redirects, and the API docs all follow it. (#1252, #1324)
- **Arabic OCR**: choose Arabic explicitly, or let auto mode detect it. Works for image and PDF OCR. (#4130, #4183)
- **pdf-to-text offers OCR** when a PDF, or a whole batch, has no text layer, instead of returning an empty file. (#4142, #4198)
- **Drag-and-drop page ordering in Organize PDF**, mouse and touch. (#1249, #2601)
- **Reorder files before a multi-file run**: merge, stitch, collage, and the other multi-file tools keep the order you set. (#756, #757)
- **Cancel batch and pipeline runs**, and the work actually stops on the server. (#807)
- **`snapotter-admin` recovery commands**: `reset-password`, `create-admin`, `unlock-user`, and MFA reset, for admins locked out of the web UI. (#4016)
- **MFA enrollment at login**: when MFA is required, users without it set it up on the spot instead of being blocked.
- **Camera capture and an installable app**: take a photo straight into a tool on mobile, and install SnapOtter as a PWA. (#773)
- **Transparent padding in the editor's Canvas Size dialog.** (#4111)
- **Update notices for admins**: when a newer SnapOtter is out, admins see a dismissible notice with a link to the release notes. The check runs through the existing analytics connection, so it's off when analytics is off.

### Improvements {#v2-3-0-improvements}

- **Background removal is faster on repeat runs**: the model stays loaded between requests instead of reloading every time. (#4144)
- **Batch uploads use much less memory**: each file goes to scratch disk and is processed one at a time instead of sitting in RAM. (#2687)
- **AI bundle installs fail cleanly and roll back** instead of leaving a half-installed venv. Proxmox LXC background-removal installs work again, and low-memory hosts get sensible CPU limits before a job starts. (#2628, #2597, #2526, #2546)
- **GPU detection is more reliable**: CUDA is detected through the driver, RTX 50-series cards fall back to CPU instead of failing, and hardware video encoders are test-run before use. (#4225, #4075, #3980, #3983)
- **`MAX_WORKER_THREADS` now works**. It was parsed but never applied. (#3249)
- **Long tools get the long timeout**: pdf-to-word, compress-pdf, convert-document, and content-aware resize no longer time out early on big files. (#3276)
- **Compress PDF keeps scans readable**, and says so when a target size can't be reached instead of producing an unreadable file. (#4112)
- **Failed logins are throttled per username**: more than ten in fifteen minutes gets a 429 with `Retry-After`. (#827)
- **Errors say what went wrong**: missing binaries, storage faults, out-of-memory kills, and upload limits now get specific messages instead of a bare 500 or 422.
- **The audit log covers tool, batch, and pipeline runs**, and user, role, team, and GDPR events record who did what to whom. (#3991, #3984)
- **The all-in-one container stops on a bad first boot** instead of restarting forever, and the embedded Postgres and Redis have startup deadlines. (#3008, #1130)
- **Dates and plurals follow your language**, and the last hardcoded English strings are translated.
- **Mobile and editor polish**: slider, Sign PDF, and crop layouts on phones, touch drag, faster pixel brushes, and Levels and Curves in undo and autosave.

### Bug Fixes {#v2-3-0-bug-fixes}

- **Adjust Colors combined settings wrongly**: temperature, saturation, hue, contrast, and sepia overrode each other instead of stacking. (#3153, #3120, #3469)
- **Pixelate didn't pixelate**, and PNG output was quietly palette-reduced across image tools. (#709, #716)
- **Animated GIF and WebP lost frames** in several tools, and GIF palettes and transparency came out wrong. (#1184, #1225, #3407, #2573)
- **Rotated uploads lost quality**: auto-orient dropped lossless encoding, transparency, and 16-bit depth. Animated WebP now rotates every frame. (#2384, #2529)
- **TIFFs with transparency, AV1 HEIF files, and several RAW formats** failed or lost alpha. (#2609, #2572, #1120)
- **Resizing the editor canvas scaled the image** instead of adding room around it. (#2081)
- **Output filenames got mangled**: `.jpeg` and `.tif` became something else, and dotfiles or names that repeat their extension broke. (#3495, #3382)
- **Library auto-save ignored the storage quota**, and storage counters could go negative. (#2389, #2585)
- **Jobs stuck after a restart** are now settled at startup instead of showing "processing" forever. (#3219, #3193)
- **OIDC sign-in named every new user "admin"**, and iOS Safari sign-ins ended on an error page after succeeding. (#862, #4021)
- **Disabled password rules were still enforced** when creating users. (#1028)
- **Damaged PDFs hung for 30 seconds** before failing. (#920)
- **The AI bundle disk check asked for about 18 GB** to install a single bundle. (#1248)
- **Compress Video failed on variable-frame-rate screen recordings.** (#2427)
- **Batch background removal lost finished results** when the browser retried the request. (#2015)
- **Settings number fields couldn't be cleared** while typing. (#1449)
- **Turning analytics off left queued events to send** about 30 seconds later. They're now dropped when you opt out. (#4270)

### Upgrade Notes {#v2-3-0-upgrade-notes}

Migrations run on their own at startup. You don't need to run any SQL.

- **Database roles.** The canonical Compose file now gives the app a role that can only read and write data (`DATABASE_URL`) and a separate privileged connection (`DATABASE_MIGRATION_URL`) that's used only at boot for migrations and grants. An existing Compose file keeps working as before: leave `DATABASE_MIGRATION_URL` unset and SnapOtter runs with one role. For a non-local deployment, set `POSTGRES_APP_PASSWORD` alongside `POSTGRES_PASSWORD`.
- **Stricter startup checks.** These used to fail later, or quietly. Now they stop the container with a message naming the variable: an unsupported `DEFAULT_LOCALE` (use a supported code like `de`, not `de_DE`), malformed `SAML_IDP_SSO_URL`, `SAML_CALLBACK_URL`, or `OIDC_ISSUER_URL` when SSO is on, an invalid `TRUST_PROXY` list, a bad `BASE_PATH`, and an unwritable `LOG_DIR`.
- **`TRUST_PROXY` no longer takes a hop count.** A number like `TRUST_PROXY=2` now stops the container at startup instead of silently trusting no proxy. Set it to the proxy addresses or named ranges (the default is `loopback,linklocal,uniquelocal`), `false` when nothing proxies SnapOtter, or `true` only when a proxy you control sits in front on a public address. (#998)
- **`MAX_WORKER_THREADS` now takes effect.** If you set it and saw no change before, you'll see it now.
- **API status codes.** Engine and storage faults return 503 `ENGINE_UNAVAILABLE` (batch endpoints used to return 422). Over-limit uploads return 413 (was 400). Malformed `clientJobId` returns 400 and a reused one 409 (was 500). Replaying your own pipeline batch returns 202. `mode=targetSize` without `targetSizeKb` returns 400. A refused local login under SSO enforcement returns 401 instead of 403 `SSO_ENFORCED`. Throttled logins return 429 `LOGIN_THROTTLED`. The remove-background result no longer includes `originalUrl`.
- **New optional variables**: `BASE_PATH`, `DATABASE_MIGRATION_URL`, `GDPR_EXPORT_TIMEOUT_MS` (15 minutes by default, `0` disables), `EMBEDDED_REDIS_TIMEOUT_S` (180), and `EMBEDDED_POSTGRES_TIMEOUT_S` (600).
- **Compose files ship with the release.** `docker-compose.yml` and `docker-compose-gpu.yml` are attached to this release, so you can download them straight from the release page.

### Acknowledgements {#v2-3-0-acknowledgements}

A million pulls means a lot of people reporting bugs, sending fixes, and telling us what was missing. This release is mostly their work.

Code and contributions:

- **@zakka258** ❤️: Built the PDF Multi-Tool page editor and subpath deployment, two of the biggest features in this release, including the tests for auth and SSO under a subpath. (#1338, #1252, #1324, #1295)
- **@akshat-lakhera** ❤️: Built the one-click compress-to-size image presets, fixed preview concurrency and cleanup, and stopped blocked browser storage from hanging the login spinner. (#1250, #1368, #2359)
- **@ChrisCreatesNet** ❤️: Added drag-and-drop page reordering to Organize PDF, which they'd first asked for in Discussions. (#1249, #965)
- **@drakeo338** ❤️: Ten fixes across the stack, including auto-orient keeping format and quality, SCIM groups created in one transaction, AI installs under cgroup v2, and 5xx errors no longer masked as 422. (#1229, #2014, #1638, #1667)
- **@SuranaSanyam** ❤️: Added transparent canvas padding to the editor, fixed stale Compress PDF target-size verdicts, and allowed partial team updates. (#4111, #4112, #1906, #2366, #2367)
- **@thejdubb02** ❤️: Stopped self-hosted instances sending heatmap data, validated `TRUST_PROXY` at startup instead of crashing, and fixed SCIM group-name and qpdf timeout handling. (#1051, #1052, #1053, #993, #994)
- **@88subarno88** ❤️: Turned several 500s into proper 400 and 409 answers for malformed job ids and multipart imports, and fixed clearing number fields in Settings. (#1486, #1556, #1603, #1449)
- **@harshoutoftokens** ❤️: Made barcode reading work offline by bundling its decoder, fixed media previews showing the input, and improved format search. (#1401, #1512, #1388)
- **@darklabs9** ❤️: Reported and fixed Compress Video failing on variable-frame-rate screen recordings. (#2426, #2427)
- **@dvd233** ❤️: Exposed every camera RAW format the decoder supports, and made favicon tools show up for ICO searches. (#1120, #1121)
- **@bercedev** ❤️: Fixed filenames whose stem repeats the extension, and made AI report the device it actually runs on. (#3382, #3613)
- **@pamod-madubashana** ❤️: Translated the last English-only MFA heading and wired up unused progress strings. (#1228, #1227)
- **@mvanhorn** ❤️: Fixed duplicate username allocation on SAML sign-in. (#2640)
- **@peremunoz** ❤️: Stopped barcode generation hiding storage and memory faults as "Invalid text". (#4057)
- **@mayuriphad** ❤️: Fixed a crash on a malformed stored alert auth header. (#3080)
- **@DevShoaib78** ❤️: Fixed closing the polygonal lasso in the editor. (#1207)
- **@dltsum** ❤️: Moved progress displays onto the shared message catalog. (#1262)
- **@albanobattistella** ❤️: Translation fixes. (#1024)
- **@shoaibyazdani** ❤️: Regenerated the macOS visual baselines. (#2475)

Security disclosures:

- **@xaferima** ❤️: Found that SVGs the decoder rejected skipped sanitization, and worked through the impact with us. (GHSA-9c7h-xjrp-8gh3, #1211)
- **@emirhancatkin** ❤️: Found that result links also served the original upload. (GHSA-jgv3-2jc6-f628, #3623)
- **@shaoyuuuuu** ❤️: Found that passport photo and background effects trusted a client-supplied job id. (GHSA-3c8g-8v4x-qq9j, #3623)
- **@nguyenvantiennani** ❤️: Found that URL import skipped permission checks. (GHSA-8xxr-g2w8-7f9r, #3780)
- **tonghuaroot** ❤️: Reported IPv6 bypasses of the SSRF address checks, with working proofs of concept. The fixes shipped in 2.0.0, and this thank-you is overdue. (#287)

Bug reports:

- **@kabo** ❤️: The example `docker-compose.yml` didn't work. (#1027)
- **@xromen** ❤️: Damaged PDFs hanging until a 30-second qpdf timeout. (#920)
- **@snmabaur** ❤️: OIDC sign-in setting every profile name to "admin". (#862)
- **@CodecNomad** ❤️: The Blur tool duplicating the image. (#829)
- **@ohora0923** ❤️ and **@Alexis-VS-CSharp** ❤️: Pixelate not working. (#678, #775)
- **@mptpro** ❤️: The background-removal AI download failing. (#714)
- **@dominic427** ❤️: Resizing the editor canvas scaled the image instead of extending it. (#2016)
- **@CodeByToast** ❤️: Number fields in Settings that couldn't be cleared. (#1186)
- **@gioxx** ❤️: The AI bundle disk check demanding about 18 GB for one bundle. (#1248)
- **@rekcodocker** ❤️ and **@madmike970** ❤️: AI bundle installs failing on Proxmox LXC, with the container details that helped pin it down. (#1030, #352)
- **@wxf26054** ❤️: Disabled password rules still enforced when creating users. (#1028)
- **@ersil** ❤️: iOS Safari requesting the OIDC callback twice and landing on an error page after a successful sign-in. (#4021)
- **@casi-3** ❤️: Batch background removal losing finished results when the browser replayed the request, with a precise diagnosis. (#2015)
- **@killervette42** ❤️: The Blackwell GPU failure on unRaid, which fed into the RTX 50-series CPU fallback. (#120, #4075)

Feature requests and feedback:

- **@photoevents** ❤️: Measured that background removal spent about 11 seconds loading the model and 1 second inferring, proposed caching sessions, and shared what they'd learned running their own cache. That became the session cache in this release. (#768, #776, #4144)
- **@benbou8231** ❤️: Pointed out that imported files land in reverse order across multi-file tools, which led to reordering before a run. (#729, #756)
- **@cf3901646** ❤️: Traced a noisy production error to Postgres error class 58 and proposed the fix. We couldn't merge their PR without a signed CLA, so we wrote the same fix ourselves. (#4210, #4253)
- **@chiliec** ❤️: Spotted that a failed auto-orient was swallowed silently and that install progress ignored the translation catalog. Both proposals shipped through maintainer PRs. (#1266, #1416, #1258, #1262)
- **@wahajahmed010** ❤️: Proposed single-flighting the enterprise module import, the fix for concurrent SCIM requests disagreeing about the licence. (#1267, #1283)
- **@chenzeyan54-commits** ❤️: Pointed out that the configuration guide never mentioned the engine binary overrides or `SNAPOTTER_HW_ACCEL`, which are documented now. (#1312, #1696)
- **@aron-intframe** ❤️: Reproduced an exiftool error-handling gap on a fresh clone and found the temp-path race was worse than the issue described. (#3458)

Thank you as well to the community members who reported these over Discord and email, whose names we did not record.

[Full diff on GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v2.2.0...v2.3.0)

---

## v2.2.0 {#v2-2-0}

Most of 2.2 is hardening. A non-admin holding a delegated `users:manage` role could take over an instance, and every tool endpoint turned out to be missing its permission check. Upgrade if you run more than one user.

The rest is the long tail of self-hosting: downloads that started and never finished, presets that broke the moment you added a second file, containers that crash-looped while Postgres was still coming up. Two new tools landed too. Docs and the website are now translated into 21 languages, and the interface finally clears WCAG AA contrast.

> [!IMPORTANT]
> If you granted `users:manage` to a non-admin through a custom role, that role could take over administrator accounts on 2.0.0 through 2.1.0. Details in Security.

### Security {#v2-2-0-security}

- **Privilege escalation through a delegated `users:manage` role (GHSA-9xgh-95qh-2x7h).** A non-admin holding `users:manage` through a custom role could reset the password of, or delete, a higher-privileged account, a built-in administrator included, and take over the instance. Password reset and account deletion now verify the caller's authority over the target, so a delegated role cannot reach above its own level. Affected: 2.0.0 through 2.1.0. Reported by 李春来 (Chunlai Li). (#616)
- **Every tool endpoint is now gated.** Tool access was enforced route by route, so all 45 hand-written routes had to remember the same call and none of them did. A role without `tools:use` could still run image-to-pdf, erase-object, upscale, sign-pdf and the rest. The check now lives in one preHandler keyed off the matched route, so it covers sub-paths and any route added later. (#646)
- **Rate limiting was bypassable on Docker installs.** The image shipped `TRUST_PROXY=true`, so the client IP came from a request header and a forged `X-Forwarded-For` walked past the login limiter. The default is now a private-network trust list. (#649)
- **Settings writes are checked per setting**, not once at the door, and config import is now transactional so a rejected key cannot leave half a config applied. (#618)
- **Library filenames cannot escape their storage root.** A crafted stored name, which a malicious 1.x SQLite import copies verbatim, could read or delete files outside the files directory. Only reachable after an operator imports an attacker-supplied 1.x SQLite database, which is the one path that lets a stored name be chosen. Reported by @Alpastx. (GHSA-55w2-8cqf-w969, #600)
- **Job cancellation enforces ownership**, so an authenticated user can no longer cancel another user's job by its id. Reported by @Alpastx. (GHSA-wqxf-gj2p-689x, #599)
- **A re-audit of the whole 2.0 tree caught what was still open**: a captured SAML assertion could be replayed, an MFA challenge survived any number of wrong codes, the per-request API-key lookup was a full table scan, `MAX_WORKSPACE_SIZE_GB` was dead config, and the SVG sanitizer let through unquoted `javascript:` hrefs. (#620)
- **Nine disclosed CVEs patched**: fast-uri, svgo, sharp and tar transitively (#619), plus Pillow 12.3.0 (#517). RAW decoding on arm64 now builds LibRaw 0.22.2 from source instead of linking an unpatched system copy. (#649)

### New Features {#v2-2-0-new-features}

- **Rounded Crop**: rounded-square and iOS-style squircle masks, with a corner-radius control. Built for favicons and app icons. (#602)
- **Remove GIF Background**: strip the background from an animated GIF, WebP or APNG frame by frame and get a transparent animation back. (#502)
- **Object Eraser lasso and High Quality mode**: drag a freeform loop instead of painting every pixel, and optionally install a diffusion inpainting bundle for cleaner large-area fills. (#503, #566)
- **Save as new, or overwrite.** Editing a library file used to silently supersede the original. You now choose per edit, and the default keeps it. (#564, #577)
- **Aspect-ratio presets in Resize.** Pick 1:1, 4:3 or 16:9 and the two dimensions stay locked, without upscaling. (#530)
- **Two-tier OCR**: a fast tier is baked into the image and runs offline with no download, and a more accurate runtime installs on demand. (#519)
- **Type anywhere to search.** Start typing on the dashboard or the homepage and it lands in the search box. (#644)
- **Documentation and website in 21 languages**: the docs site, the landing pages and the API reference are all translated now, joining the app interface. A new low-resource deployment guide covers Raspberry Pi and 2 GB machines. (#548)
- **Clearer tool names**: 18 ambiguous names now self-qualify, so "Compress" became "Compress Image". Tool ids and routes are unchanged, so nothing bookmarked breaks. (#520)

### Improvements {#v2-2-0-improvements}

- **WCAG AA contrast across the interface**: the palette was retuned so vivid orange stays on fills while text and labels use accessible ink tokens, and all 57 focus indicators now clear the 3:1 non-text bar. (#567, #574)
- **Upscale and background removal stop looking frozen**: the progress bar advances during inference instead of parking at 30%, and both tools now warn that a CPU-only host is much slower. (#605, #608)
- **Timeout messages name the real cause** and account for CPU-only hosts instead of blaming the upload. (#596)
- **SnapOtter waits for Postgres and Redis at startup** instead of crash-looping, in Compose and the all-in-one image alike. A Proxmox LXC install was restarting 76 times before this. (#537, #595)
- **Downloads survive a reverse proxy**: SnapOtter asks nginx and compatible proxies not to buffer file responses, which is the usual reason a self-hosted download starts and never finishes. (#604, #607)
- **Compress PDF lands near the target size**, and says so honestly when a target is out of reach. (#522)
- **Mobile tool controls stay reachable** now that the app shells size to the dynamic viewport. (#559)
- **Convert Audio exposes a sample-rate setting.** (#561)
- **Admins can relax the minimum password length**, down to 1 for a trusted LAN instance. (#543)
- **MFA is self-service**, the policy lockout is closed, and OIDC or SAML logins get a real MFA challenge instead of a hard block. (#531, #536)
- **A bare `Error: Error` now names its cause.** Sharp encode failures, AI sidecar exits, non-JSON document sidecar output, and background-removal failures all used to arrive with the reason scrubbed off. (#532, #534, #535, #538, #612)
- **The help dialog is translated.** Its shortcut labels and getting-started text were hardcoded English while finished translations sat unused in all 21 locale files. (#647)

### Bug Fixes {#v2-2-0-bug-fixes}

- **iPhone HEIC files were rejected** as unreadable before they reached the decoder that handles them. (#631)
- **Conversion presets failed on a second file**: jpg-to-pdf and its image-to-pdf siblings, plus pdf-to-png, pdf-to-jpg and pdf-to-tiff, all returned `Tool not found` once you uploaded two files. (#633, #643)
- **PDF conversion presets lost their download button.** (#629)
- **An unlimited processing timeout was not honored**, and stalled progress streams now recover instead of leaving the interface waiting. (#638)
- **Downloads hung instead of failing** when a stored file turned out shorter than its recorded length. (#617)
- **PDF page tools failed on short and encrypted files**: Remove Pages defaulted to a page range no document under six pages has, and password-protected PDFs failed cryptically inside the worker. (#594)
- **PDF to Text silently returned an empty file** for scanned PDFs. It now points you at OCR and serves text as UTF-8. (#603)
- **PDF to Word dropped colored text blocks** and split them across the page. (#500)
- **Object Eraser left ghost remnants** and blurred small objects in high-resolution images. (#501)
- **Stabilize Video wrote unplayable output** without faststart. (#593)
- **Image editor repairs**: rotate, flip, resize, levels, curves, filters and layer lock. (#597)
- **Sign PDF showed a blank canvas** instead of reporting why a PDF failed to load. (#545)
- **The file library recorded 0x0 dimensions** and skipped previews for HEIC, RAW and PSD uploads. (#636, #637)
- **Installing more than one AI bundle** left the shared virtualenv multi-versioned and quietly broke three tools. (#649)
- **Converting to JXL at quality 1 through 4 returned a 500**, and a missing ffmpeg was reported to you as a corrupt upload. (#649)
- **A transient Postgres outage stranded finished jobs**, leaving output on disk with no row pointing at it. A reconciler now adopts that work instead of dropping it. (#649)
- **A Redis endpoint that changed address wedged every consumer** while health checks still answered 200. (#649)
- **Website and docs fixes**: localized links no longer drop `#` fragments or lowercase `zh-CN`, the docs nav stays inside the viewport on tablets, and neither site calls the GitHub API from your browser any more. (#516, #562, #570, #560)

### Upgrade Notes {#v2-2-0-upgrade-notes}

Nothing to migrate, but two shipped defaults changed:

- **`TRUST_PROXY` now defaults to `loopback,linklocal,uniquelocal`** instead of trusting every peer. Docker bridge and Compose networks sit inside that range, so most setups need no change. If your reverse proxy reaches SnapOtter from a public address, set `TRUST_PROXY` explicitly, or rate limiting and audit logs will attribute every request to the proxy.
- **`MAX_AI_JOBS_PER_USER` defaults to 5** in-flight single-file AI jobs per user. Batch and pipeline AI runs stay uncapped.

New optional knobs: `DB_STARTUP_TIMEOUT_MS`, `SUBPROCESS_MEMORY_LIMIT_MB` (off by default) and `GIF_BG_MAX_FRAMES`.

### Acknowledgements {#v2-2-0-acknowledgements}

A good part of this release started as someone else's bug report.

Code and contributions:

- **@mvanhorn** ❤️: Rewrote the remove-background timeout failure into a message that says what to do about it, instead of a bare timeout. (#518, #494)
- **@EuanTop** ❤️: Restored the download action on PDF conversion preset pages by making the synchronous route return the standard tool-result contract. (#629, #623)
- **@harshjainnn** ❤️: Diagnosed the download that starts and never finishes, and proposed the socket-reset direction the fix was built on. (#617, #590)

Security disclosures:

- **李春来 (Chunlai Li)** ❤️ ([@laijunyue](https://github.com/laijunyue)): Privately disclosed the privilege escalation through a delegated `users:manage` role, with a full source-to-sink analysis and a working exploit chain. (GHSA-9xgh-95qh-2x7h, #616)
- **@Alpastx** ❤️ (Alpesh Bhagwatkar): Disclosed an authenticated IDOR on job cancellation, and a path traversal in library stored filenames reachable after a malicious 1.x SQLite import, with a working proof of concept for each. (#599, #600)

Bug reports:

- **@riz467** ❤️: Real iPhone HEIC files rejected at validation, with the root cause worked out in the report. (#622)
- **@coupej** ❤️: PDF preset pages hanging forever, and jpg-to-pdf failing as soon as a second file was added. Two distinct bugs, correctly separated. (#623, #627)
- **@linuxuser1** ❤️: `PROCESSING_TIMEOUT_S=0` documented as unlimited but capped at five minutes. (#630)
- **@bezibaerchen** ❤️: Convert Audio hid the sample-rate setting its own description promised. (#558)
- **@hell-toupee** ❤️: The accurate OCR bundle failing to install with a `libpaddle` error. (#505)
- **@Michael1260** ❤️ and **@And-CSH** ❤️: Confirmed that OCR install failure independently and established that manual extraction works while the in-app installer does not, which pinned the bug to the installer. (#505)
- **@TomErnst1972** ❤️: Enabling the MFA-required policy locking an admin out of their own instance. (#515)
- **@thokich** ❤️: Object erasing producing blurry, unusable fills, which drove both the HD inpainting rewrite and the optional high-quality bundle. (#141)
- **@Hennie-git** ❤️: A Proxmox LXC install restarting 76 times against a Postgres that was not yet accepting connections. (community-scripts/ProxmoxVE#15796)
- **MickLesk** ❤️ (Proxmox VE community-scripts): Triaged that report in real time and produced the diagnosis the startup fix was built on. (#537)

Feature requests and feedback:

- **@LECOQQ** ❤️: Asked to relax password complexity on a home-server install. (#136)
- **@killervette42** ❤️: Asked for an Unraid Community App, now published to the Unraid CA store. (#96)
- **@alienatedsec** ❤️: Pointed out the GPU-falls-back-to-CPU fix was buried in a closed issue and undiscoverable, which is why it is in the deployment docs now. (#490, #587)
- **@neilp316** ❤️: Confirmed the Blackwell GPU failure on an RTX 5060 and mapped a working CUDA 12.8 upgrade path. (#120)
- **@Roiki11** ❤️: Argued for shared storage with path references over HTTP file transfer for off-box AI compute. (#189)

Thank you as well to the community members who reported these over Discord and email, whose names we did not record: the squircle crop request (#602), the image-to-PDF download that started and never finished (#604, #607), the Delete Pages tool getting stuck (#594), Arabic text missing from pdf-to-text (#603), and the diagnosis behind the ONNX GPU fallback (#490).

[Full diff on GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v2.1.0...v2.2.0)

---

## v2.0.0 {#v2-0-0}

SnapOtter 2.0 turns the image toolkit into a full file-manipulation suite: 200+ tools across five modalities (Image, Video, Audio, PDF, and Files), rebuilt on Postgres 17 and a Redis-backed job queue, with a one-command `docker run`. This is a major release; read Breaking changes before upgrading from 1.x.

### New features {#new-features}

- **Four new tool modalities**: Video, Audio, PDF, and Files join Image, taking the catalog to 200+ tools.
- **Durable background jobs**: A Redis-backed queue (BullMQ) runs every tool as a tracked job with live SSE progress.
- **All-in-one single-container mode**: One `docker run` boots a complete instance with embedded Postgres and Redis.
- **On-demand AI bundles**: Background removal, OCR, transcription, upscaling, face detection and enhancement, object eraser, colorize, and photo restoration install from the UI. GPU acceleration is detected per framework.
- **Sign PDF**: Draw, type, or upload a signature and place it on a PDF in the browser.
- **Automate**: A visual pipeline builder that chains tools, with nine prebuilt templates.
- **83 one-click conversion presets**: Dedicated JPG-to-PNG, MP4-to-GIF, and similar converters with fuzzy search.
- **Layer-based image editor**: A Konva-powered editor at `/editor` with brushes, shapes, adjustments, filters, and curves.
- **Files library**: Save any result and reuse it as input to another tool.
- Pinned tools, in-canvas zoom and pan, 21 languages, and enterprise capabilities (OIDC/SSO, SAML, SCIM, S3 storage, per-tool permissions, audit export, distributed tracing).

### Improvements {#improvements}

- Cancel a running process. (#137)
- Full-resolution RAW decoding through LibRaw, including DNG. (#289)
- Non-root and foreign-UID deployments (TrueNAS, Unraid, OpenShift, PUID/PGID). (#230, #127)
- Accurate AI install detection and a hardened install flow. (#214, #352)
- Privacy hardening: no automatic third-party egress, plus an optional strict-offline mode.
- Always-on feedback button, even with analytics off.

### Bug fixes {#bug-fixes}

- `RATE_LIMIT_PER_MIN=0` disables rate limiting for tool routes again. (#271)
- Repaired AI virtualenv paths inside the Docker image. (#390)
- sharp 0.35.2+ compatibility. (#362)
- Image editor layout fixes: rulers, fill behavior, sidebar, and canvas sizing. (#258, #259)
- Completed the Italian translation. (#231, #206, #425)
- Audio normalize and loudnorm preserve the source sample rate.
- SSRF hardening: numeric IPv6 CIDR matching and a broadened URL pre-scan. (#287)
- Generated PDFs are stamped with SnapOtter as the Producer.
- mediapipe installs on Python 3.13 and Debian 13.

### Breaking changes {#breaking-changes}

2.0 replaces the embedded SQLite database with Postgres 17 and adds Redis 8 for the job queue. Your 1.x data migrates automatically on first boot, but the container stack changed, so back up your whole `/data` volume first (1.x runs SQLite in WAL mode, so the committed data usually lives in `snapotter.db-wal`). Then pick the single-container image (embedded Postgres and Redis, root only) or the Compose stack (app plus Postgres 17 and Redis 8). See the [migration guide](https://github.com/snapotter-hq/SnapOtter/blob/main/MIGRATING.md) and the [upgrade guide](/guide/upgrading).

### Upgrade {#upgrade}

```bash
docker pull snapotter/snapotter:2.0.0
```

Or with Docker Compose:

```bash
docker compose pull && docker compose up -d
```

[Full diff on GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.2...v2.0.0)

---

## v1.17.2 {#v1-17-2}

New HTML to Image tool, WCAG 2.2 AA accessibility, security hardening from penetration testing, and 5 critical Docker fixes.

### New features {#new-features-1}

- **HTML to Image**: Capture screenshots of URLs or raw HTML as PNG/JPEG/WebP. Full-page captures, custom viewports, dark mode.
- **Docker _FILE secret convention**: Mount sensitive env vars as files instead of plain-text. (#205)
- **Enterprise licensing and S3 storage**: Optional commercial license key and S3-compatible object storage.
- **Shape editor improvements**: Fill/stroke transparency, RGBA color picker, dash line styles.
- **Pre-built release archives**: Download tarballs from GitHub Releases for non-Docker installs (Proxmox, bare metal, LXC). (#202)

### Improvements {#improvements-1}

- **WCAG 2.2 AA accessibility**: Skip navigation, focus trapping, aria-live regions, reduced motion support, correct contrast ratios. (#209)
- **Mobile responsiveness**: Responsive settings, SSE auto-reconnect on mobile tab switch. (#203, #204)
- **Background removal quality**: Edge smoothing, color decontamination, output format selection.
- **Italian translation**: ~145 new strings by @albanobattistella. (#206)
- **Per-tool API documentation**: 53 doc pages with parameters, examples, and response formats.
- **AI model downloads**: Retry logic with exponential backoff for HuggingFace. (#201)

### Bug fixes {#bug-fixes-1}

- Fresh Docker containers were completely unusable (rate limit blocked all requests).
- Face detection AI tools (blur-faces, red-eye-removal, enhance-faces, passport-photo) failed on all platforms.
- HEIC files broken on ARM (libheif symbol mismatch).
- Upscale and restore-photo AI bundles failed to install on ARM.
- OCR used wrong CUDA version on GPU containers.
- SSRF guard bypass via hex IPv4-mapped IPv6 addresses. (Credit: @tonghuaroot)
- iPhone HEIC decoding with auxiliary images. (#183, #199)
- Real-ESRGAN CUDA OOM on 8GB GPUs. (#200)
- 6 production Sentry errors and 7 QA bugs. (#208)

### Security {#security}

- 10 penetration test findings addressed (XFF bypass, malformed JSON crashes, unbounded pipelines, audit log XSS, TRACE method, and more). (#207)
- SSRF hex IPv6 bypass blocked. (Credit: @tonghuaroot)
- Dockerfile base images pinned by digest.

### Upgrade {#upgrade-1}

```bash
docker pull snapotter/snapotter:1.17.2
```

Or with Docker Compose:

```bash
docker compose pull && docker compose up -d
```

[Full diff on GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.1...v1.17.2)

---

## v1.17.1 {#v1-17-1}

Live demo, per-tool landing pages, and a batch of polish fixes.

### New features {#new-features-2}

- **Live demo** - [demo.snapotter.com](https://demo.snapotter.com) lets people try SnapOtter without installing anything.
- **Tools index page** - Browse all 50+ tools at `/tools` with search and category filters.
- **50+ SEO landing pages** - Every tool now has a dedicated landing page with FAQs, use cases, and comparison tables.
- **Background preview** - Before-after slider shows a checkered background behind transparent images.
- **Strong password generator** - One-click button in the Add Members form.

### Bug fixes {#bug-fixes-2}

- HEIC/HEIF info tool no longer fails (pre-decode added).
- AI model bundle install shows better error messages and respects resource limits.
- Library thumbnails load correctly (auth headers were missing).
- Dropdown menus no longer clip in People and Teams settings tables.
- Size comparison percentage hidden on non-compression tools.
- Duplicate privacy policy link removed.
- Italian translation added for AI features settings.
- Renamed Lucide icons updated (Wand2, Columns).

### Infrastructure {#infrastructure}

- OpenSSF Scorecard hardened from 4.3 to ~7.0.
- CI tests parallelized into 4 shards with downsized fixtures.
- 41 dependency updates.

### Upgrade {#upgrade-2}

```bash
docker pull snapotter/snapotter:1.17.1
```

Or with Docker Compose:

```bash
docker compose pull && docker compose up -d
```

[Full diff on GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.0...v1.17.1)

---

## v1.17.0 {#v1-17-0}

Five new tools, a full image editor, SSO login, 20 languages. Probably should have been three separate releases, but here we are.

### New features {#new-features-3}

- **Image editor** - Layers, brushes, shapes, adjustments, filters, curves, keyboard shortcuts. Runs in your browser, processes on your hardware.
- **OIDC / SSO authentication** - Login with Google, GitHub, Okta, or any OpenID Connect provider. Set a few env vars and your team uses their existing accounts.
- **Meme generator** - 100 built-in templates with text rendering via opentype.js. Or upload your own image.
- **Beautify** - Drop a screenshot in, get a polished image out. Device frames (macOS, Windows, browser), shadows, gradients, social media presets.
- **Color blindness simulation** - Preview how images look with protanopia, deuteranopia, tritanopia, and other color vision deficiencies.
- **PNG transparency fixer** - Detects fake-transparent PNGs and fixes them with BiRefNet HR-matting. Optional watermark removal via LaMa inpainting.
- **AI canvas expand** - Extend image boundaries with AI fill. Three quality tiers (fast, balanced, quality) depending on how much GPU time you want to trade.
- **20 languages** - Arabic, Chinese (Simplified/Traditional), Czech, Dutch, French, German, Hindi, Indonesian, Italian, Japanese, Korean, Polish, Portuguese, Russian, Spanish, Thai, Turkish, Ukrainian, Vietnamese. RTL works for Arabic.
- **URL import** - Paste URLs into the dropzone or bulk-import from a list. Server-side fetch with SSRF protection.
- **Multi-file eraser** - Draw erase masks across multiple images, process them all with one click. Strokes persist per-image.
- **Pipeline import/export** - Save tool chains as JSON, share them with others.
- **17 new camera RAW formats** via exiftool, plus QOI, JP2, EPS, DDS, CUR, DPX, FITS, PPM/PGM/PBM, SVGZ, and APNG input. New output codecs for BMP, ICO, JP2, QOI. AVIF, TIFF, GIF, JXL, and PSD export recovered from a previously lost branch.

### Improvements {#improvements-2}

- **Image enhancement** - Replaced the old pipeline with CLAHE + normalise + gamma. New Deep Enhance toggle uses the AI model for more aggressive results.
- **Restore photo** - Scratch detection rewritten with 8-angle Otsu filtering. LaMa inpainting now runs at native resolution.
- **Exotic formats everywhere** - OCR, image-to-PDF, favicon generator, composition, stitch, and vectorize all decode HEIC, RAW, PSD now.
- **Compress** - Target-size tolerance tightened from 5% to 1%. Target size is the default mode. Added stepper buttons and KB/MB unit selector.
- **Sentry cleanup** - 644 non-actionable events filtered. Real errors now handled properly.
- **GPU detection** - Better diagnostics for containers where CUDA is present but nvidia-smi is not.
- **Auth-disabled mode** - Anonymous user is seeded in the DB with admin role. API keys, pipelines, and user files no longer break on FK constraints.
- **2,705+ new tests** across unit, integration, and E2E.

### Bug fixes {#bug-fixes-3}

- Upscale on CPU no longer times out on NAS boxes and low-power hardware.
- QR code logo no longer makes the preview vanish permanently.
- Crop overflow fixed for tall portrait images.
- TIFF alpha files correctly force PNG output instead of producing corruption.
- HDR/EXR decode converts to 8-bit before CLAHE, fixing decode failures.
- Face landmarks input buffers converted to PNG before the Python sidecar, fixing crashes.
- Find duplicates handles mixed-format batches and network errors.
- Beautify preview updates in real time.
- Progress bars for stitch and vectorize.
- SVGZ handled by SVG-to-raster.
- Non-ASCII filenames fixed via percent-encoded X-File-Results header.

### Upgrade {#upgrade-3}

```bash
docker pull snapotter/snapotter:1.17.0
```

Or with Docker Compose:

```bash
docker compose pull && docker compose up -d
```

[Full diff on GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.16.0...v1.17.0)

---

## v1.14.0 {#v1-14-0}

Unified Docker image with GPU auto-detection. One image handles both CPU and GPU workloads. Simplified compose to a single file with log rotation. Model pre-downloads now include verification and a smoke test.

---

## v1.13.0 {#v1-13-0}

Role-based access control (RBAC). 14 granular permissions, three built-in roles (admin, editor, user), custom role support. Permission checks on all API routes. Frontend tabs filtered by user permissions.

---

## v1.12.0 {#v1-12-0}

PDF to Image tool. Convert PDF pages to PNG, JPEG, WebP, or TIFF at custom DPI. Unified Docker image with GPU auto-detection.

---

## v1.11.0 {#v1-11-0}

Auto-generated llms.txt via vitepress-plugin-llms for AI-friendly documentation.

---

## v1.10.0 {#v1-10-0}

Content-aware resize (seam carving) with face protection. Resize images while preserving important content.

---

## v1.9.0 {#v1-9-0}

Stitch / Combine tool. Join images side by side, stacked vertically, or in a custom grid.

---

## v1.8.0 {#v1-8-0}

Edit Metadata tool. View and edit EXIF, IPTC, and XMP metadata with a granular strip/keep interface.

---

## Older releases {#older-releases}

For the full commit-level changelog including patch releases, see [GitHub Releases](https://github.com/snapotter-hq/snapotter/releases).
