# [1.16.0](https://github.com/wheetazlab/ashim/compare/v1.15.9...v1.16.0) (2026-04-18)


### Bug Fixes

* **ci:** make GHCR login optional so forks without GHCR_TOKEN secret can still build ([f2cd39f](https://github.com/wheetazlab/ashim/commit/f2cd39f8c4c0973d776529930fda7715aafbc3c3))
* **ci:** remove conditional cache logic, simplify GHCR login ([2afea3b](https://github.com/wheetazlab/ashim/commit/2afea3bd219df9fb7f7a63d0e8a732e7cf4aadcd))
* **ci:** replace GHCR_TOKEN with built-in GITHUB_TOKEN for GHCR auth ([53e69b8](https://github.com/wheetazlab/ashim/commit/53e69b8861b6ff78e723630b09027b757c9138a1))


### Features

* multi-GPU support, lazy model downloads, and Helm chart ([246c3d3](https://github.com/wheetazlab/ashim/commit/246c3d3c73fa29753e61181e1f30a0b631d67c5d)), closes [#pages](https://github.com/wheetazlab/ashim/issues/pages) [#pages](https://github.com/wheetazlab/ashim/issues/pages)

## [1.15.8](https://github.com/ashim-hq/ashim/compare/v1.15.7...v1.15.8) (2026-04-17)


### Bug Fixes

* copy Node.js from official image instead of apt-get install ([536125e](https://github.com/ashim-hq/ashim/commit/536125ec9fbc5758bdd3e8f0f4c44253de2231c7))

## [1.15.7](https://github.com/ashim-hq/ashim/compare/v1.15.6...v1.15.7) (2026-04-17)


### Bug Fixes

* add retry with backoff for apt-get update on CUDA base image ([3d6db5a](https://github.com/ashim-hq/ashim/commit/3d6db5a32d3f9292d5476e9bd80c1f06624fa316))

## [1.15.6](https://github.com/ashim-hq/ashim/compare/v1.15.5...v1.15.6) (2026-04-17)


### Performance Improvements

* parallelize model downloads and switch to registry cache ([79c4ed6](https://github.com/ashim-hq/ashim/commit/79c4ed6a359b008dedeb154a55e2764ee0e3d9fa))

## [1.15.5](https://github.com/ashim-hq/ashim/compare/v1.15.4...v1.15.5) (2026-04-17)


### Bug Fixes

* exclude e2e-docker tests from Vitest runner ([8df18c5](https://github.com/ashim-hq/ashim/commit/8df18c56a6c69e2a188cf0e7c97e692cd4c0e7ec))

## [1.15.4](https://github.com/ashim-hq/ashim/compare/v1.15.3...v1.15.4) (2026-04-17)


### Bug Fixes

* verbose error handling, batch processing, and multi-file support ([3223960](https://github.com/ashim-hq/ashim/commit/32239600ae6ce30628e77e61a805ca0a167b5068))
* verbose errors, batch processing, multi-file support ([#1](https://github.com/ashim-hq/ashim/issues/1)) ([8b87cf8](https://github.com/ashim-hq/ashim/commit/8b87cf888c6194e2af427a180607d7c53a1d15b9))

## [1.15.3](https://github.com/ashim-hq/ashim/compare/v1.15.2...v1.15.3) (2026-04-16)


### Bug Fixes

* retry apt-get update on transient mirror sync errors (Acquire::Retries=3) ([cec7163](https://github.com/ashim-hq/ashim/commit/cec71632d0c868c3a413b813ff15baccc8fa8cdd))

## [1.15.2](https://github.com/ashim-hq/ashim/compare/v1.15.1...v1.15.2) (2026-04-16)


### Bug Fixes

* use GHCR_TOKEN with write:packages scope for GHCR login ([e14414f](https://github.com/ashim-hq/ashim/commit/e14414f3061981b1454dc7d4504c64ec01db945e))

## [1.15.1](https://github.com/ashim-hq/ashim/compare/v1.15.0...v1.15.1) (2026-04-16)


### Bug Fixes

* **docker:** create /opt/models unconditionally so chown works in CI ([93ce289](https://github.com/ashim-hq/ashim/commit/93ce2891cc26afc93f01168d008927d3d356c1a9))
* **docker:** run frontend builder on BUILDPLATFORM to fix esbuild crash under QEMU ([6a3ad0d](https://github.com/ashim-hq/ashim/commit/6a3ad0d496e291b30a3f719ca079c43ce7aab705))
* resolve runtime model path mismatch for non-root Docker user ([f28792a](https://github.com/ashim-hq/ashim/commit/f28792a5ed78221f38cf2f3c80cae9f24cd7f5e3))

# [1.14.0](https://github.com/ashim-hq/ashim/compare/v1.13.0...v1.14.0) (2026-04-10)


### Bug Fixes

* add FILES_STORAGE_PATH to Dockerfile ENV to prevent data loss ([b575243](https://github.com/ashim-hq/ashim/commit/b575243e9a0cb2ac4567d785a74e57dea912e9e2))
* add shutdown timeout and improve health endpoint ([986ad37](https://github.com/ashim-hq/ashim/commit/986ad37bb5e6644dd93521018a1bcd2d6243f502))
* address code review findings before merge ([caf65bc](https://github.com/ashim-hq/ashim/commit/caf65bc4697ddfea27674b56fd2e8de847edc734))
* correct PaddleOCR language codes for model download and OCR ([e1ee571](https://github.com/ashim-hq/ashim/commit/e1ee57103c201f104b737c2719d0014d4912d4b2))
* force CPU mode in download_models.py for build-time compatibility ([b4b59a7](https://github.com/ashim-hq/ashim/commit/b4b59a7500375bc2e65cb0050e5308b07610d2cf))
* handle paddlepaddle-gpu CUDA import at build time gracefully ([0083a74](https://github.com/ashim-hq/ashim/commit/0083a741a9a3924ccc37c4e622c2980a8a41f1a3))
* install cuda-compat stubs for build-time PaddlePaddle import ([d31d665](https://github.com/ashim-hq/ashim/commit/d31d66556ef0aa7c20a73a94f5d95b54b99fbb8a))
* load RealESRGAN pretrained weights for actual AI upscaling ([fa9569c](https://github.com/ashim-hq/ashim/commit/fa9569c920d6bdac094dcd661fc5cf3b4be3f17a))
* revert to npx tsx in CMD for pnpm compatibility ([e55253d](https://github.com/ashim-hq/ashim/commit/e55253dee03f9e93187d50e0ffb66b423a1230c0))
* simplify smoke test to CPU-only imports for build-time compat ([3481663](https://github.com/ashim-hq/ashim/commit/34816639609cbccab91a5cad5760fea769c4b565))
* skip RealESRGAN import check on arm64 in smoke test ([1e2ef52](https://github.com/ashim-hq/ashim/commit/1e2ef5284686253ae33e05411a515369b7f41a3e))
* split paddlepaddle-gpu and paddleocr installs, use --extra-index-url ([74183e8](https://github.com/ashim-hq/ashim/commit/74183e8dc1e3d8f90cff4484f5526c3c3dfba9a6))
* suppress ML library stdout noise in ocr.py and upscale.py ([c0b419d](https://github.com/ashim-hq/ashim/commit/c0b419de21acb92b243ef78191dff6a2153c5961))
* use PaddlePaddle GPU package index for CUDA wheels ([dd9528f](https://github.com/ashim-hq/ashim/commit/dd9528f53c9bcf148842ab94f14a4ebd5ae223ec))
* use platform-specific mediapipe version for arm64 compatibility ([7face19](https://github.com/ashim-hq/ashim/commit/7face19238f54cfea02d453b697e34b50ccd9d21))


### Features

* expand model pre-download with verification and smoke test ([a9e3b96](https://github.com/ashim-hq/ashim/commit/a9e3b9688776a51efd2f42cae810de425cf1d9cf))
* simplify CI to single unified Docker build ([b385a2e](https://github.com/ashim-hq/ashim/commit/b385a2eabb255f7a8fe2d3720a358ff5bf254310))
* simplify compose to single file, add log rotation ([84f7057](https://github.com/ashim-hq/ashim/commit/84f7057a49850b7a47440099ec2caad8d3b87efe))
* unified Docker image with GPU auto-detection ([6c3eb3b](https://github.com/ashim-hq/ashim/commit/6c3eb3b876cee0301d5fb3ed8324a3c8e92b1307))

# [1.13.0](https://github.com/ashim-hq/ashim/compare/v1.12.0...v1.13.0) (2026-04-10)


### Bug Fixes

* complete RBAC implementation lost during merge ([cc8a272](https://github.com/ashim-hq/ashim/commit/cc8a27239b02a63ca88abc3e363c8a46f89674e8))


### Features

* add backend permission map and requirePermission middleware ([1a99571](https://github.com/ashim-hq/ashim/commit/1a995711535a1525e709cdd7bff75361f457e942))
* add permission checks and admin override to API key routes ([d776680](https://github.com/ashim-hq/ashim/commit/d776680f2d2342e35b84821792d6c24ae7e0ffbc))
* add permission checks and admin override to pipeline routes ([59f40db](https://github.com/ashim-hq/ashim/commit/59f40dbfd4a97f8691b5fbbf6d338063c389987b))
* add permission checks and ownership scoping to user-files routes ([86ba698](https://github.com/ashim-hq/ashim/commit/86ba69825a1dd87c9f868d79cd806b7d594cce1b))
* add shared Permission and Role types ([2f594e9](https://github.com/ashim-hq/ashim/commit/2f594e96057c72bf107f3012426e87af5f97eb94))
* add tools:use permission check to tool, batch, pipeline, and upload routes ([885ace5](https://github.com/ashim-hq/ashim/commit/885ace54f09b3301989f8aa404c15f60e19c054d))
* extend useAuth hook with role and permissions from session ([e0ba8be](https://github.com/ashim-hq/ashim/commit/e0ba8be7b3211299c8cde90b2d22e7796eee2206))
* filter settings tabs by user permissions, remove admin fallback ([bcbd24a](https://github.com/ashim-hq/ashim/commit/bcbd24a2395b93b64dbbf638ba0138f9ec9ba9da))
* include permissions and teamName in login/session responses ([4943177](https://github.com/ashim-hq/ashim/commit/49431772ec6a02eae8aced48da92ef87a6c89afb))
* replace requireAdmin with requirePermission on all routes ([af7f57d](https://github.com/ashim-hq/ashim/commit/af7f57d52f49c8f8412876639076084c96eba284))

# [1.12.0](https://github.com/ashim-hq/ashim/compare/v1.11.0...v1.12.0) (2026-04-10)


### Bug Fixes

* **a11y:** add keyboard support to pdf-to-image upload dropzone ([1778f72](https://github.com/ashim-hq/ashim/commit/1778f7266b9837a07b20f167e82e1e9b163086b7))
* use specific selector in pdf-to-image e2e test ([b2a2c89](https://github.com/ashim-hq/ashim/commit/b2a2c890a1d25f60e392e6a2df23e1600cc3ad8d))


### Features

* add pdf-to-image backend route with info and processing endpoints ([30155c1](https://github.com/ashim-hq/ashim/commit/30155c1c7073c55290d4f662f7f93779cc4512b7))
* add pdf-to-image frontend settings component ([44bbfba](https://github.com/ashim-hq/ashim/commit/44bbfba80dfb3eb069c563e5ca691a0f8dce1eea))
* register pdf-to-image in frontend tool registry ([5fd294c](https://github.com/ashim-hq/ashim/commit/5fd294c994e7df076c4de0016f62d952a161345b))
* register pdf-to-image tool in shared constants and i18n ([43324c1](https://github.com/ashim-hq/ashim/commit/43324c1f23e3f278c89fa301d5a0275b12f587e7))
* unified Docker image with GPU auto-detection ([#37](https://github.com/ashim-hq/ashim/issues/37)) ([b0083e2](https://github.com/ashim-hq/ashim/commit/b0083e2b083d0bf52b6a576f7ef67fbff0cc8cbe))

# [1.12.0](https://github.com/ashim-hq/ashim/compare/v1.11.0...v1.12.0) (2026-04-10)


### Features

* unified Docker image with GPU auto-detection ([#37](https://github.com/ashim-hq/ashim/issues/37)) ([b0083e2](https://github.com/ashim-hq/ashim/commit/b0083e2b083d0bf52b6a576f7ef67fbff0cc8cbe))

# [1.11.0](https://github.com/ashim-hq/ashim/compare/v1.10.0...v1.11.0) (2026-04-07)


### Features

* **docs:** auto-generate llms.txt via vitepress-plugin-llms ([ee28ec6](https://github.com/ashim-hq/ashim/commit/ee28ec66ea137127bb1f4f1bf9e43be0b9f78cbf))

# [1.10.0](https://github.com/ashim-hq/ashim/compare/v1.9.0...v1.10.0) (2026-04-07)


### Features

* add content-aware resize API route and registration ([aa3cc5c](https://github.com/ashim-hq/ashim/commit/aa3cc5c6d0d602bcc88dac23684620676c4b3a3f))
* add content-aware resize toggle to resize settings UI ([4b4464f](https://github.com/ashim-hq/ashim/commit/4b4464f4a0b63ec312d961fecc22232b39e14872))
* add seam carving AI bridge module ([3c0f5b6](https://github.com/ashim-hq/ashim/commit/3c0f5b6c45bf0ba8b37d67aa0fa25d3c3603e888))
* add seam carving Python script with face protection ([fb833e4](https://github.com/ashim-hq/ashim/commit/fb833e4613ab8aa63b95facc2fe621eaa27e438a))

# [1.9.0](https://github.com/ashim-hq/ashim/compare/v1.8.1...v1.9.0) (2026-04-07)


### Features

* add stitch API route handler ([63ea0ba](https://github.com/ashim-hq/ashim/commit/63ea0ba5ef23ba3b1b296ae21358ce150f8f2bf2))
* add stitch settings UI component ([6abe893](https://github.com/ashim-hq/ashim/commit/6abe893c467b4b868383e15316132787d5831029))
* register stitch component in web tool registry ([612f7d9](https://github.com/ashim-hq/ashim/commit/612f7d90124e92ba324a59b5a6642290dc216cff))
* register stitch route in API tool registry ([a37d54f](https://github.com/ashim-hq/ashim/commit/a37d54f2c1e72b711901b87367b4d1c9ba2a5c5b))
* register stitch tool in shared constants and i18n ([b881416](https://github.com/ashim-hq/ashim/commit/b881416a164cc482a050adc93164fa1c88937a2f))

## [1.8.1](https://github.com/ashim-hq/ashim/compare/v1.8.0...v1.8.1) (2026-04-07)


### Bug Fixes

* add variant diagnostics to health endpoint and lite mode banner ([2c6e499](https://github.com/ashim-hq/ashim/commit/2c6e4996d5d711d1d20fb6105f55da48d6f04c62))

# [1.8.0](https://github.com/ashim-hq/ashim/compare/v1.7.7...v1.8.0) (2026-04-06)


### Bug Fixes

* filter unsafe round-trip keys server-side in editMetadata ([32bde85](https://github.com/ashim-hq/ashim/commit/32bde85956c4d99c7b8c255fc3166a79a72644ff))


### Features

* add edit-metadata API route with inspect and edit endpoints ([ff07b83](https://github.com/ashim-hq/ashim/commit/ff07b8301ce3db875307296d62a17037fa960360))
* add edit-metadata UI component with granular strip support ([dcd600d](https://github.com/ashim-hq/ashim/commit/dcd600d0f4a4ded2669d3471926d63288aaada84))
* add EditMetadataOptions type and exif-reader dep to image-engine ([39bc5bc](https://github.com/ashim-hq/ashim/commit/39bc5bc9eb02f21774fed1c0a4fbdd3d09623483))
* extract shared metadata parsing utilities into image-engine ([c075849](https://github.com/ashim-hq/ashim/commit/c07584993f99de2eaa455c9962e3ab3eaadd9613))
* implement editMetadata operation in image-engine ([f3be1ef](https://github.com/ashim-hq/ashim/commit/f3be1efd8b03bef84e9237fc3dac8bc6f70ff234))
* register edit-metadata in shared constants and i18n ([4a424d7](https://github.com/ashim-hq/ashim/commit/4a424d74b5a82aff26f09b67de3f3ab4c0f5555e))

## [1.7.7](https://github.com/ashim-hq/ashim/compare/v1.7.6...v1.7.7) (2026-04-06)


### Bug Fixes

* improve AI tool reliability for face detection and background removal ([#25](https://github.com/ashim-hq/ashim/issues/25)) ([1963a80](https://github.com/ashim-hq/ashim/commit/1963a8012c572fe86132e6847e313019165416da))

## [1.7.6](https://github.com/ashim-hq/ashim/compare/v1.7.5...v1.7.6) (2026-04-06)


### Bug Fixes

* batch SSE progress and non-AI processing UX ([#24](https://github.com/ashim-hq/ashim/issues/24)) ([0ce42d1](https://github.com/ashim-hq/ashim/commit/0ce42d1b2fa4f0b753a962a1f45a491e29ecee24))

## [1.7.5](https://github.com/ashim-hq/ashim/compare/v1.7.4...v1.7.5) (2026-04-06)


### Bug Fixes

* add server-side logging to AI tool routes ([#23](https://github.com/ashim-hq/ashim/issues/23)) ([3645de8](https://github.com/ashim-hq/ashim/commit/3645de89326644c5173cdfee58f6b762cb308609))

## [1.7.4](https://github.com/ashim-hq/ashim/compare/v1.7.3...v1.7.4) (2026-04-06)


### Bug Fixes

* batch file ordering and format preservation for image tools ([#20](https://github.com/ashim-hq/ashim/issues/20)) ([822a078](https://github.com/ashim-hq/ashim/commit/822a078882ba4ade851c68bc8fe115dc69cb2a81)), closes [#13](https://github.com/ashim-hq/ashim/issues/13) [#14](https://github.com/ashim-hq/ashim/issues/14)

## [1.7.3](https://github.com/ashim-hq/ashim/compare/v1.7.2...v1.7.3) (2026-04-06)


### Bug Fixes

* **docs:** correct broken llms.txt links on REST API page ([5e3a8b3](https://github.com/ashim-hq/ashim/commit/5e3a8b390c33812b7c4d0044b2a0ba3719d380ac))

## [1.7.2](https://github.com/ashim-hq/ashim/compare/v1.7.1...v1.7.2) (2026-04-05)


### Bug Fixes

* use torch.cuda for GPU detection instead of onnxruntime providers ([7185bd5](https://github.com/ashim-hq/ashim/commit/7185bd5ce373a42cd94e750765ee11d328fb34bb))

## [1.7.1](https://github.com/ashim-hq/ashim/compare/v1.7.0...v1.7.1) (2026-04-05)


### Bug Fixes

* prevent false GPU detection when CUDA image runs without GPU ([1efb163](https://github.com/ashim-hq/ashim/commit/1efb163acd0271f956fb777955f8701460230def))

# [1.7.0](https://github.com/ashim-hq/ashim/compare/v1.6.0...v1.7.0) (2026-04-05)


### Bug Fixes

* **web:** skip empty Authorization header for forward-auth proxy compatibility ([636153f](https://github.com/ashim-hq/ashim/commit/636153f8f131e683b2553df2732e967772e07017)), closes [#6](https://github.com/ashim-hq/ashim/issues/6)


### Features

* add GPU/CUDA acceleration support (:cuda Docker tag) ([a5f62f0](https://github.com/ashim-hq/ashim/commit/a5f62f0d1426092b6b0164cf1ae1159a392ebf44))

# [1.6.0](https://github.com/ashim-hq/ashim/compare/v1.5.3...v1.6.0) (2026-04-04)


### Features

* lightweight Docker image without AI/ML tools (:lite tag) ([3a0b988](https://github.com/ashim-hq/ashim/commit/3a0b988b746a5fbe6df10fe8ee288e30e42d747f)), closes [#1](https://github.com/ashim-hq/ashim/issues/1)

## [1.5.3](https://github.com/ashim-hq/ashim/compare/v1.5.2...v1.5.3) (2026-04-04)


### Bug Fixes

* use heif-convert for HEIC decoding on Linux ([da15a1e](https://github.com/ashim-hq/ashim/commit/da15a1e833c15c3d93a9da734d354b725b99b0bf))

## [1.5.2](https://github.com/ashim-hq/ashim/compare/v1.5.1...v1.5.2) (2026-04-04)


### Bug Fixes

* install HEVC codec plugins for CI HEIC tests ([24e7591](https://github.com/ashim-hq/ashim/commit/24e7591b9af777b739e7cc0db80839b776074b6f))

## [1.5.1](https://github.com/ashim-hq/ashim/compare/v1.5.0...v1.5.1) (2026-04-04)


### Bug Fixes

* install libheif-examples in CI for HEIC tests ([d06092c](https://github.com/ashim-hq/ashim/commit/d06092cba9db8cd91154196a11796a6dfc37bebb))

# [1.5.0](https://github.com/ashim-hq/ashim/compare/v1.4.0...v1.5.0) (2026-04-04)


### Features

* add HEIC/HEIF format support for input and output ([df1dc02](https://github.com/ashim-hq/ashim/commit/df1dc029857f0fa614f63c2bc835f9502be046fb))

# [1.4.0](https://github.com/ashim-hq/ashim/compare/v1.3.1...v1.4.0) (2026-04-04)


### Features

* add "Crop to Content" mode to smart crop tool ([df479d3](https://github.com/ashim-hq/ashim/commit/df479d3410a8b0d89c93f14ab6471c9dda2b0744)), closes [#7](https://github.com/ashim-hq/ashim/issues/7)

## [1.3.1](https://github.com/ashim-hq/ashim/compare/v1.3.0...v1.3.1) (2026-04-04)


### Bug Fixes

* default theme to light instead of following system preference ([018fcce](https://github.com/ashim-hq/ashim/commit/018fcce84cd2bf4c7b49f1eff9eda5bc078d19d3))

# [1.3.0](https://github.com/ashim-hq/ashim/compare/v1.2.1...v1.3.0) (2026-04-04)


### Bug Fixes

* add XHR timeout to prevent UI spinning forever ([0abacb2](https://github.com/ashim-hq/ashim/commit/0abacb211cc60f3c1e8dabccc24bc6ca46ce782a))
* disable worker pool to prevent Docker processing hang ([e36cd0c](https://github.com/ashim-hq/ashim/commit/e36cd0c24a34c5f716b5018e57f3d319fe5c5c44))
* log volume permission errors instead of swallowing them ([a3e6927](https://github.com/ashim-hq/ashim/commit/a3e6927df0f4fdd06f6c2aafbf6dbd1c52019cb2))
* replace crypto.randomUUID with generateId in AI tool settings ([ed91861](https://github.com/ashim-hq/ashim/commit/ed918615d2449bdda93d6ea12420454571edbf2d))
* replace crypto.randomUUID with generateId in pipeline/automation ([bcbf86c](https://github.com/ashim-hq/ashim/commit/bcbf86c04b76ecdbc2bfae5a67d5ac929ba2ae8e))
* replace crypto.randomUUID with generateId in use-tool-processor ([07cc2d0](https://github.com/ashim-hq/ashim/commit/07cc2d002e5964a1dee20d05021aa4b479c75f6e))
* replace navigator.clipboard with copyToClipboard utility ([1857aeb](https://github.com/ashim-hq/ashim/commit/1857aeb89407ecb878ae967594e6408150d20d37))
* resolve multiple API and e2e test bugs ([00deafb](https://github.com/ashim-hq/ashim/commit/00deafb2c8ad5cef14eb74207f3b2bd2bc3f13f2))
* restore navigator.clipboard and execCommand mocks in tests ([57e71b7](https://github.com/ashim-hq/ashim/commit/57e71b7c9a2c3d77bf6318df35bed7fe8c1d7e69))


### Features

* add copyToClipboard() utility with execCommand fallback ([8686131](https://github.com/ashim-hq/ashim/commit/868613188e010760e33c96df60d03930027535da))
* add generateId() utility for non-secure context compatibility ([ee7741b](https://github.com/ashim-hq/ashim/commit/ee7741b26765e95cf145400f4a39bfa06b9dfe9a))

## [1.2.1](https://github.com/ashim-hq/ashim/compare/v1.2.0...v1.2.1) (2026-04-03)


### Bug Fixes

* handle volume permission issues for bind-mounted /data directory ([863a51c](https://github.com/ashim-hq/ashim/commit/863a51c37d481f5f01b965f58e56eae0f7cd6538))

# [1.2.0](https://github.com/ashim-hq/ashim/compare/v1.1.0...v1.2.0) (2026-04-03)


### Features

* move theme toggle and GitHub button to top-right navbar ([0ba9fa5](https://github.com/ashim-hq/ashim/commit/0ba9fa5db7efa2557ed569d638c15256f9453364))

# [1.1.0](https://github.com/ashim-hq/ashim/compare/v1.0.1...v1.1.0) (2026-04-03)


### Features

* add GitHub stars button to docs navbar and fix footer license ([90030fc](https://github.com/ashim-hq/ashim/commit/90030fccafed8ad247063ef71dca3cdedaff3916))

## [1.0.1](https://github.com/ashim-hq/ashim/compare/v1.0.0...v1.0.1) (2026-03-30)


### Bug Fixes

* allow SVG files in the convert tool ([034281b](https://github.com/ashim-hq/ashim/commit/034281b1d4b19487ec0f900c3173465e0faf2510))

# 1.0.0 (2026-03-30)


### Bug Fixes

* **a11y:** add aria-hidden to decorative GemLogo SVG ([ae185ce](https://github.com/ashim-hq/ashim/commit/ae185ce767a480719d2f54d5675cbd7d64beb7b5))
* add remove-background settings to pipeline step configurator ([ae5ac81](https://github.com/ashim-hq/ashim/commit/ae5ac8134689e211f17534f3064995597b6337c8))
* add SSE progress endpoint to public paths ([18c3da0](https://github.com/ashim-hq/ashim/commit/18c3da0d41cba74c55fffd1a9f58c1a8ee5d5574))
* **api:** allow Scalar docs through auth and CSP ([6023109](https://github.com/ashim-hq/ashim/commit/6023109df9c66c1e7b4d81f3e902f081809ed6ba))
* **api:** resolve team name lookup and show server error messages ([609fc8b](https://github.com/ashim-hq/ashim/commit/609fc8b6cc2d2408226e2576c35d7715bdf1498c))
* **api:** use content instead of spec.content for Scalar v1.49 API ([dfcb4d5](https://github.com/ashim-hq/ashim/commit/dfcb4d579f4b44013d23dff8617d9a9f6315b452))
* apply continuous progress bar to erase-object and OCR ([196c553](https://github.com/ashim-hq/ashim/commit/196c553af57bb9efbd32282dd24fc080fb7228dd))
* **blur-faces:** switch from MediaPipe to OpenCV and auto-orient images ([dc10f90](https://github.com/ashim-hq/ashim/commit/dc10f905c62c662f1a40701c81874e5854ea33e6))
* bridge.ts ENOENT check for Python venv fallback ([92442cd](https://github.com/ashim-hq/ashim/commit/92442cd0fd354e9644d7957dd5035a9fc16d9b95))
* clear search when adding a step from the tool picker ([ae2e63f](https://github.com/ashim-hq/ashim/commit/ae2e63f7fc4af3556539eee577b253c0616cbd0f))
* continuous progress bar (no 100%→0% reset) ([b4abefe](https://github.com/ashim-hq/ashim/commit/b4abefe94776a1b9a9700f469e56de060c7626ca))
* **crop:** use percentCrop from onChange to fix inflated pixel values ([f238820](https://github.com/ashim-hq/ashim/commit/f2388206324e4ddc6114b91421ca8bcb634fc340))
* deduplicate react in Vite to prevent zustand hook errors in monorepo ([b3d6947](https://github.com/ashim-hq/ashim/commit/b3d6947d47f9b22b155e3a8c46667dd7671ac508))
* **docker:** add build layer caching for faster Docker rebuilds ([03ba30d](https://github.com/ashim-hq/ashim/commit/03ba30d8f01c5c2500641d934b08a875589bcd68))
* **docker:** skip husky prepare script in production install ([fdfb0a0](https://github.com/ashim-hq/ashim/commit/fdfb0a0e7412c86e3b85a70daf5093f44c34ee99))
* **docs:** clean up footer llms.txt links ([e842cde](https://github.com/ashim-hq/ashim/commit/e842cde838ad3deb1437c4c43c8ccd796276248c))
* **docs:** ignore localhost dead links in VitePress build ([78269d4](https://github.com/ashim-hq/ashim/commit/78269d499c914d5d68c4455475a1608f4af2a075))
* **docs:** remove hero logo from home page ([64c0ec8](https://github.com/ashim-hq/ashim/commit/64c0ec895f82b09e50d5ecf2b85f759f0a481232))
* handle migration race condition in concurrent test workers ([d576ab1](https://github.com/ashim-hq/ashim/commit/d576ab1dfb1e9d2aa739c681c1f83d6fef3f7d22))
* make port 1349 the UI port in all modes ([20a2637](https://github.com/ashim-hq/ashim/commit/20a26372d8be1c2c4fc10a821b1e000c663efb0c))
* move health diagnostics behind admin auth ([ee9a20f](https://github.com/ashim-hq/ashim/commit/ee9a20f6a35a0681b3688f0e206914fceed8fd8c))
* **ocr:** update PaddleOCR for v3 API and add Tesseract fallback ([e260a93](https://github.com/ashim-hq/ashim/commit/e260a93cf65f1e7cd22b7b5d491c6125fee8c915))
* pipeline only shows compatible tools and displays errors ([fe021c1](https://github.com/ashim-hq/ashim/commit/fe021c18b134c853262c8f0dac81c13f9ceeb435))
* prevent pipeline step settings from resetting on collapse ([d899ef1](https://github.com/ashim-hq/ashim/commit/d899ef128004e46200da785a960da50894e93861))
* prevent stale closure in pipeline step callbacks ([c67f002](https://github.com/ashim-hq/ashim/commit/c67f0027804f167e250bd497505399c07b539c4e))
* prevent useAuth infinite loop causing rate limit storms ([9624dae](https://github.com/ashim-hq/ashim/commit/9624dae1569b6f2ad52ce990fc84eca809b849a8))
* Python bridge fallback only on missing venv, not script errors ([79e4116](https://github.com/ashim-hq/ashim/commit/79e41160cb8bc1010ab87d1c396934e15e104086))
* reject HTML tags in settings API to prevent stored XSS ([d5bd011](https://github.com/ashim-hq/ashim/commit/d5bd01189766ee0797fe35ff3651f38f59a65881))
* remove explicit pnpm version from CI to avoid conflict with packageManager ([c0f5dad](https://github.com/ashim-hq/ashim/commit/c0f5dad93332bad09e5e771e1b52513186256b33))
* remove Google Drive coming soon placeholder from files nav ([e487fe0](https://github.com/ashim-hq/ashim/commit/e487fe06bf4cad6512100bf9660498e06c1047ba))
* resolve 3 critical UX bugs - home upload, auth, and form submit ([97267c7](https://github.com/ashim-hq/ashim/commit/97267c7b747e0d5861ca5272f553af4162e8cd9a))
* resolve pipeline step race condition and infinite re-render loop ([e0177d4](https://github.com/ashim-hq/ashim/commit/e0177d405ef043a64f0b3a885e98169312be1fac))
* resolve test failures from shared DB race conditions ([1a7116d](https://github.com/ashim-hq/ashim/commit/1a7116d79072d131b94d1c454abbc32b9e961c1b))
* resolve tsx not found in AI docs updater workflow ([dfbef8d](https://github.com/ashim-hq/ashim/commit/dfbef8d723dcc2960187db36676107f708707e33))
* resolve TypeScript Uint8Array type error with fflate ([c1b06b3](https://github.com/ashim-hq/ashim/commit/c1b06b37f2cf2aef6971f1b16b5691ce7d932b87))
* restore APP_VERSION import used by health endpoint ([2a74b60](https://github.com/ashim-hq/ashim/commit/2a74b604466193994bcc87ba2ef589f4c15d9547))
* setError(null) was overriding setProcessing(true) ([2be94b7](https://github.com/ashim-hq/ashim/commit/2be94b77b2b288086b55101e6854bf0407935b28))
* show checkerboard behind transparent images in before/after slider ([73741e6](https://github.com/ashim-hq/ashim/commit/73741e6efbdee53396810a2bb11eaf9597e4aa32))
* simplify public health to static response, add 403 test ([9c05da6](https://github.com/ashim-hq/ashim/commit/9c05da6f1372abd071e5249b102d86fa294e0d22))
* streamline CI/CD — remove broken AI docs updater, fix Docker publish ([ad2c96d](https://github.com/ashim-hq/ashim/commit/ad2c96d7b86b55b602e973f5da30d517605ed5cd))
* surface hidden errors and add batch rejection tests ([2f8e2ce](https://github.com/ashim-hq/ashim/commit/2f8e2ce7e2b96613ebda249890632bc54c11980b))
* switch README Docker references from GHCR to Docker Hub ([9e15679](https://github.com/ashim-hq/ashim/commit/9e1567971d50d755ef3b51d31e80b5a31a28ed2d))
* sync stepsRef during render, not useEffect ([0c86744](https://github.com/ashim-hq/ashim/commit/0c86744dda1073988c7e6bb55073f08e399c26f3))
* **test:** add missing PNG fixture files to repo ([45c6b9d](https://github.com/ashim-hq/ashim/commit/45c6b9de08124fb357ac759e43c4fbf1eb5fbfb9))
* **test:** exclude e2e tests from vitest and fix CI test suite ([9d28485](https://github.com/ashim-hq/ashim/commit/9d28485339e17b80586cea91bd18dafc989d7f24))
* **tests:** remove temp DB cleanup that races with other test files ([498bfb3](https://github.com/ashim-hq/ashim/commit/498bfb3def2d6786fa5e387b3e30ede9768ef616))
* trigger browser password save prompt on password change ([6b279ad](https://github.com/ashim-hq/ashim/commit/6b279ad09b9e74de34732b0e854f1180f25b34bd))
* **ui:** clean up settings, automate page, fullscreen logo, and README ([b3c8ad4](https://github.com/ashim-hq/ashim/commit/b3c8ad4697000454a11aaace27d0baa37a9959d9))
* unify project on port 1349, improve strip-metadata and UI components ([4912ee3](https://github.com/ashim-hq/ashim/commit/4912ee37e961b9ba9748d7ffa9164d7ca5ae0abb))
* **upscale:** auto-orient images before upscaling and improve UI ([8a6e665](https://github.com/ashim-hq/ashim/commit/8a6e665a4484bda1e4b93b520c393bb707a624aa))
* use BiRefNet-Lite as default model and fix JSON parsing ([c8159d3](https://github.com/ashim-hq/ashim/commit/c8159d3a9a0394f1bec3a66ffea6122a787a7ca7))
* use two-pass validation in settings PUT to prevent partial writes ([2dc39d3](https://github.com/ashim-hq/ashim/commit/2dc39d353320b73d9abb96ee5ae1080c2ee2f9cb))
* use U2-Net as default model (fast, 2s) with BiRefNet as opt-in ([7ebed9a](https://github.com/ashim-hq/ashim/commit/7ebed9a8d44f13d091fbc599be83b34a92049c5f))
* white screen crash when uploading photos with null GPS EXIF data ([c913df9](https://github.com/ashim-hq/ashim/commit/c913df9c0eccb0a1d0ff305cc6dcb1c99ddf96f4))


### Features

* accept clientJobId in batch endpoint for SSE progress correlation ([8ed57f4](https://github.com/ashim-hq/ashim/commit/8ed57f400fd083fbef7528f51231f59ecd3b1bee))
* add authentication with default admin user ([2189628](https://github.com/ashim-hq/ashim/commit/2189628861b83ffd29b60841f2ee74458a76a7cc))
* add automatic workspace file cleanup cron ([5af7437](https://github.com/ashim-hq/ashim/commit/5af7437d809a4e68376d68d201bf56700711836c))
* add CSS transform props to ImageViewer for live rotate/flip preview ([de3340f](https://github.com/ashim-hq/ashim/commit/de3340fc5b201cc5c046cbb38a274e7dfa026b41))
* add CSS transform props to ImageViewer for live rotate/flip preview ([7627853](https://github.com/ashim-hq/ashim/commit/762785394b2e66a25ee858da96868cd752942a7d))
* add Fastify API server with health check and env config ([be73ce9](https://github.com/ashim-hq/ashim/commit/be73ce9a2bcbab3c6a72fa735a500c6b83f86a9c))
* add forced password change page on first login ([e0900a8](https://github.com/ashim-hq/ashim/commit/e0900a877643c75266aeed5ac29501458ef0dcda))
* add format tools (SVG-to-raster, vectorize, GIF) and optimization (rename, favicon, image-to-PDF) ([7b29b04](https://github.com/ashim-hq/ashim/commit/7b29b043d850de46c5cf4ef1829f8a97dc9a0143))
* add generic tool page template with settings panel and dropzone ([0f32ba1](https://github.com/ashim-hq/ashim/commit/0f32ba10327f2fe96594544e0c7dc1b20ca479b0))
* add image-engine and ai stub packages ([17ac7b8](https://github.com/ashim-hq/ashim/commit/17ac7b83658c29a3e7a7711536c0648b3b23420a))
* add layout tools (collage, splitting, border/frame) ([e46dbf6](https://github.com/ashim-hq/ashim/commit/e46dbf6efb61e2812a7eb4c50a29b9391cd50654))
* add live preview callback to RotateSettings, rename button to Apply ([17be50b](https://github.com/ashim-hq/ashim/commit/17be50b213e1ca6d1d6e8d949b65de70c68d108d))
* add live preview callback to RotateSettings, rename button to Apply ([06844ec](https://github.com/ashim-hq/ashim/commit/06844ec1ada4d5685691f26655ecb8712b4d94d9))
* add login page with split layout matching ashim style ([2b82f93](https://github.com/ashim-hq/ashim/commit/2b82f93b083c7a5bfcd37c25e85e5887c09c87ae))
* add multi-stage Docker build with Python ML dependencies ([8d70123](https://github.com/ashim-hq/ashim/commit/8d7012398973fd561db7b868dd2d50c2e71d2ed7))
* add MultiImageViewer with arrow navigation and filmstrip ([1fa8747](https://github.com/ashim-hq/ashim/commit/1fa874758ca58efb4b9f68d76a02648d6a84abfe))
* add password generator and browser save prompt on change-password page ([d56c644](https://github.com/ashim-hq/ashim/commit/d56c6446fee8384ab61ba180160f5e020a1e412e))
* add Phase 4 AI tools with Python bridge and 6 new tools ([21df50e](https://github.com/ashim-hq/ashim/commit/21df50e140248ca51bc82fbc7b16748cf0f9c909))
* add privacy policy page and fix CSP blocking API docs ([3e314f0](https://github.com/ashim-hq/ashim/commit/3e314f032491c59196db3493d0b86f6aeec22c63))
* add processAllFiles batch method to tool processor hook ([cd1e180](https://github.com/ashim-hq/ashim/commit/cd1e18026fb4b866c4bbde6c259412674a501f05))
* add replace-color tool and update tool page routing ([d5d09e4](https://github.com/ashim-hq/ashim/commit/d5d09e4a0f23091fb251cd15e17a639cf72a407a))
* add semantic-release for automated versioning and help dialog ([83a0272](https://github.com/ashim-hq/ashim/commit/83a0272af284f182fa32e7fd9baa77fe2bd74e39))
* add shared package with types, tool definitions, and constants ([96ed415](https://github.com/ashim-hq/ashim/commit/96ed4159a57fd27f8bb3214ec01bd085a5b34a54))
* add SideBySideComparison component for resize results ([d037305](https://github.com/ashim-hq/ashim/commit/d037305f29a32ead0addf6d79ace4823c9ba0e2b))
* add SideBySideComparison component for resize results ([2d0ba5a](https://github.com/ashim-hq/ashim/commit/2d0ba5a65683b45a6382ca1aea9f7a75d1143702))
* add SQLite database with Drizzle ORM schema and migrations ([88c41cf](https://github.com/ashim-hq/ashim/commit/88c41cf27c79004fc02df0afc67c4bbc4aa1cd2f))
* add ashim-style layout with sidebar, tool panel, dropzone, and theme toggle ([90f10f4](https://github.com/ashim-hq/ashim/commit/90f10f41510136ec1fde90a00bf62f1940a10d6e))
* add Swagger/OpenAPI documentation at /api/docs ([0ef1a5a](https://github.com/ashim-hq/ashim/commit/0ef1a5a021893049fece83b48b4e178db4675813))
* add theme system with dark/light/system support and persistence ([e35d249](https://github.com/ashim-hq/ashim/commit/e35d249ac80616754b93d67da367d0e43df20064))
* add ThumbnailStrip filmstrip component ([9caa613](https://github.com/ashim-hq/ashim/commit/9caa613883a7f0f0ccfbb268d3e88596e92ce094))
* add utility tools (image info, compare, duplicates, color palette, QR, barcode) ([e17992e](https://github.com/ashim-hq/ashim/commit/e17992e6bdf4ee99980e851270c788e7a478a64f))
* add Vite + React SPA with Tailwind CSS and routing ([9483ad7](https://github.com/ashim-hq/ashim/commit/9483ad740e46adc5f2fa6b5c4992f19d429dacaf))
* add watermark, text overlay, and image composition tools ([b2543d9](https://github.com/ashim-hq/ashim/commit/b2543d9b5fc8e33a10d36c0cf32d7cb2de1e7901))
* add worker threads, persistent Python sidecar, graceful shutdown, and architectural improvements ([1274cc1](https://github.com/ashim-hq/ashim/commit/1274cc103fa2f0f934e9e2322c6034533ab62ec4))
* **adjustments:** add real-time live preview for all color tools ([b5c924e](https://github.com/ashim-hq/ashim/commit/b5c924e0fc7468c6364ef320958cea2e5ef18420))
* **ai:** add emit_progress() calls to all Python AI scripts ([eb6f57d](https://github.com/ashim-hq/ashim/commit/eb6f57dfa35fa10ada4493e9fd73fe4d4788c03c))
* **ai:** add onProgress callback to all AI wrapper functions ([021c9f1](https://github.com/ashim-hq/ashim/commit/021c9f12b5a1aca6c6c7cb8c9d9fad3d0406ab94))
* **ai:** rewrite bridge.ts to stream stderr progress via spawn ([9d9c45a](https://github.com/ashim-hq/ashim/commit/9d9c45a04c2a85e99021a35a3da94e1e19cb9043))
* **api,web:** add batch processing with ZIP download and SSE progress ([f8aa5f7](https://github.com/ashim-hq/ashim/commit/f8aa5f7bf2d81fc06e1118741d011023c2a4889b))
* **api:** add all remaining endpoints to OpenAPI spec ([e7b38ba](https://github.com/ashim-hq/ashim/commit/e7b38ba68f8ae7fae5675bafc0f2dc2c4f22ecd2))
* **api:** add all tool endpoints to OpenAPI spec ([753ba3e](https://github.com/ashim-hq/ashim/commit/753ba3e4689b1a3504960d15d1ebceaf2a08876e))
* **api:** add generic tool route factory for all image tools ([43555c9](https://github.com/ashim-hq/ashim/commit/43555c90ecedcb9364de73d51003e657f649c126))
* **api:** add llms.txt and llms-full.txt endpoints ([12ba52a](https://github.com/ashim-hq/ashim/commit/12ba52a6a0c1260f02a4d7787be8113383575d9e))
* **api:** add logo upload/serve/delete routes with tests ([6063f4d](https://github.com/ashim-hq/ashim/commit/6063f4daa98acf3f03e004a588de562e377105c7))
* **api:** add multipart file upload, workspace management, and download routes ([415de2a](https://github.com/ashim-hq/ashim/commit/415de2a5dff2c5344d38dd3b3d31513d5c2ed85b))
* **api:** add OpenAPI 3.1 spec skeleton with common schemas ([b2189f5](https://github.com/ashim-hq/ashim/commit/b2189f556815ef8d5c781eee72b8263db09f6a1a))
* **api:** add persistent file management helpers to frontend api module ([ecbfcce](https://github.com/ashim-hq/ashim/commit/ecbfcceec82010fa44244c6839928b9930d59b5a))
* **api:** add pipeline execution, save, and list endpoints ([d4f1148](https://github.com/ashim-hq/ashim/commit/d4f1148860d7801f8d0fd276d6a2ec9efa1f68af))
* **api:** add resize, crop, rotate, convert, compress, metadata, and color tool routes ([4874701](https://github.com/ashim-hq/ashim/commit/48747016ed71ad8300d463e8128b922177c23721))
* **api:** add Scalar docs route and install dependency ([6f2c319](https://github.com/ashim-hq/ashim/commit/6f2c3190b8414d1c4c3b1a78cf7a86a96109c934))
* **api:** add SingleFileProgress type and SSE update function ([12b85d4](https://github.com/ashim-hq/ashim/commit/12b85d4def1f29ca291d6f5e538181f2bcbcf774))
* **api:** add teams CRUD routes and update auth team references ([ec22e53](https://github.com/ashim-hq/ashim/commit/ec22e53a3b15ae030743e76db0d57584000727b6))
* **api:** add tool filtering and DB-backed cleanup settings ([07e7e8d](https://github.com/ashim-hq/ashim/commit/07e7e8d58d311d89f43cee1c7fa21dd0eb4c9dfb))
* **api:** add user files CRUD routes at /api/v1/files/* ([6a07007](https://github.com/ashim-hq/ashim/commit/6a070071456611d2bf2acf4a474be8c43680e1b0))
* **api:** register docs route in server and test helper ([bc6b389](https://github.com/ashim-hq/ashim/commit/bc6b38918ff11f1027efeb934ae0e56d6068b81f))
* **api:** wire AI route handlers to SSE progress via clientJobId ([a3f85da](https://github.com/ashim-hq/ashim/commit/a3f85da20f73f02cd5ec141519aa73fcfeb2157b))
* **branding:** add faceted gem SVG logo assets ([4bc9335](https://github.com/ashim-hq/ashim/commit/4bc93351541b039534197821d290d34cad12c9a7))
* **branding:** add favicon and meta tags to index.html ([2508fd0](https://github.com/ashim-hq/ashim/commit/2508fd04871cdb776523ec9d602ad934283c6211))
* **branding:** add OG social preview image ([c6c5b92](https://github.com/ashim-hq/ashim/commit/c6c5b926e271d457effea9aec07b70bbc7227ef5))
* **branding:** add PWA manifest and PNG logo assets ([298567d](https://github.com/ashim-hq/ashim/commit/298567d090f298600b334184b09d35c178097362))
* **branding:** show gem icon in app header as default logo ([dd857fb](https://github.com/ashim-hq/ashim/commit/dd857fbcc778a2425806f1d96d83f118dc92831a))
* conditional result views — side-by-side for resize, live preview for rotate ([f0d18be](https://github.com/ashim-hq/ashim/commit/f0d18bee5ebc110e63bb3cf9fd829d80900759ce))
* conditional result views — side-by-side for resize, live preview for rotate ([6682649](https://github.com/ashim-hq/ashim/commit/668264990c33667e586e4e24703f1957b18e1c0c))
* **crop:** add CropCanvas component with visual overlay, grid, and keyboard controls ([018bbf4](https://github.com/ashim-hq/ashim/commit/018bbf44bfed4acf475de49ff9f3f5c20ee63295))
* **crop:** add react-image-crop dependency ([b7ecd41](https://github.com/ashim-hq/ashim/commit/b7ecd41897de4f48e6f970dfbb1188848e9bcd2a))
* **crop:** redesign CropSettings with aspect presets, pixel inputs, and grid toggle ([d75f458](https://github.com/ashim-hq/ashim/commit/d75f458dc0f13e69640bc012adea0ee29d02b82b))
* **crop:** wire CropCanvas and CropSettings into tool-page with bidirectional state ([ea7fb46](https://github.com/ashim-hq/ashim/commit/ea7fb46f7ecad5639c007ba43d652fd72c75b39f))
* **db:** add teams table and migration ([365783b](https://github.com/ashim-hq/ashim/commit/365783b6dc1f5cfa631bb4f6915fcf99d91f574d))
* **db:** add userFiles table and migration ([a2fdbd5](https://github.com/ashim-hq/ashim/commit/a2fdbd5fef2cf02f90692166d6386c5ac21c2cef))
* **docs:** add gem favicon to VitePress site ([0918f93](https://github.com/ashim-hq/ashim/commit/0918f933719ae0d8ff16cf7a8ac0e8936e90805a))
* **docs:** add gem logo to GitHub Pages nav bar and home hero ([f0b8162](https://github.com/ashim-hq/ashim/commit/f0b8162955fa8f6b1891968163b4292b279f1ea1))
* **docs:** add llms.txt and llms-full.txt to GitHub Pages ([5f6959a](https://github.com/ashim-hq/ashim/commit/5f6959a21e3b2708edb011a0a7ce48fbfbc64c87))
* **docs:** add llms.txt links to GitHub Pages footer ([b874445](https://github.com/ashim-hq/ashim/commit/b874445dc6d31c54a095d7471390e664b233d491))
* **env:** add FILES_STORAGE_PATH config variable ([3c737a6](https://github.com/ashim-hq/ashim/commit/3c737a6c724f4862d302bf22a75ebcd745f0df4c))
* **erase-object:** replace mask upload with in-browser brush painting ([40e3081](https://github.com/ashim-hq/ashim/commit/40e30815915f18f9f7fc25c05a61c643f1dfdbe4))
* extract auto-orient utility and expand test coverage ([8622c4a](https://github.com/ashim-hq/ashim/commit/8622c4a40245504372e75d3cd851535528639dea))
* **files:** add Files page with nav, list, details, upload, and routing ([3f127a4](https://github.com/ashim-hq/ashim/commit/3f127a457e8a7a07d22fdf8776c3166092db562f))
* **files:** add mobile layout for Files page ([e864d1e](https://github.com/ashim-hq/ashim/commit/e864d1e430bd516ccbe1732ec7451e1e7d670177))
* **files:** wire serverFileId for version tracking ([8868d3e](https://github.com/ashim-hq/ashim/commit/8868d3e556beedcff35de268e72241e7f10998a3))
* harden auth, security headers, SVG sanitization, and pipeline ownership ([beaad1d](https://github.com/ashim-hq/ashim/commit/beaad1d3044f6b2535aacb6a67541464f736778b))
* **i18n:** add translation keys for settings phase 1 ([c5ff80a](https://github.com/ashim-hq/ashim/commit/c5ff80acfbe18b953cfd96a88498fc70b82b541e))
* **image-engine:** add Sharp wrapper with 14 image operations ([3e7f71c](https://github.com/ashim-hq/ashim/commit/3e7f71ca830549ea28b47656b14b9375fa8c2c34))
* **image-to-pdf:** add live PDF page preview with margin visualization ([cd666ea](https://github.com/ashim-hq/ashim/commit/cd666eaef0b13bcd9223439f0bbb5efd88b2f25e))
* implement Files page with persistent storage and version tracking ([f6183d2](https://github.com/ashim-hq/ashim/commit/f6183d2c62e6ad04dec3fe0250468cbfd6cbc035))
* initialize Turborepo monorepo with pnpm workspaces ([db31cf6](https://github.com/ashim-hq/ashim/commit/db31cf6f115c454eb59454fc227058a773944f93))
* integrate MultiImageViewer and multi-file UX into tool page ([52aab1e](https://github.com/ashim-hq/ashim/commit/52aab1e2bf5f938a800a78b4e5c11f5ad9fbae27))
* make AI tools pipeline-compatible and add search to tool picker ([2d46b09](https://github.com/ashim-hq/ashim/commit/2d46b096fa80e43f7a59e213ac884b5d1d30b586))
* merge multi-image UX — batch processing, filmstrip navigation, resize/rotate redesign ([9bfdb75](https://github.com/ashim-hq/ashim/commit/9bfdb75f5c205906f2bd62d496e96d6b402e1dc1))
* multi-arch Docker support, security hardening, and test improvements ([748d2b7](https://github.com/ashim-hq/ashim/commit/748d2b70460b3975a9c61edec0b121d788d0ee06))
* multi-file metadata display with per-file caching ([42b59f3](https://github.com/ashim-hq/ashim/commit/42b59f3e2d84b3d9fd6724b9ed9fb272fb11201a))
* **pipeline:** add inline settings configuration for automation steps ([827eae8](https://github.com/ashim-hq/ashim/commit/827eae824543ab9cea2a5d3a82acd388736fa424))
* production Docker, Playwright tests, settings API, and bug fixes ([027c515](https://github.com/ashim-hq/ashim/commit/027c515f3582c5f030fb4c3cacae2ceee575e7c7))
* replace model dropdown with intuitive subject/quality selector in remove-bg ([bc26d60](https://github.com/ashim-hq/ashim/commit/bc26d60d54a47a9fb6f58115131845d1ae5ee868))
* rewrite file-store with FileEntry model for multi-image support ([abbb3e4](https://github.com/ashim-hq/ashim/commit/abbb3e4d6e8f21f35b385c51fb659010099556d1))
* rewrite resize settings with tab-based UI (presets, custom, scale) ([b9f3ac0](https://github.com/ashim-hq/ashim/commit/b9f3ac0d222f3712d35becd6c831dc62f728a16a))
* rewrite resize settings with tab-based UI (presets, custom, scale) ([3b39a8c](https://github.com/ashim-hq/ashim/commit/3b39a8cc5f11a5093f42bcdbe97989fce3841616))
* **rotate:** add editable angle input and fine-tune +/- buttons ([e1f04c2](https://github.com/ashim-hq/ashim/commit/e1f04c28a6b03c0503266c0e78e7a9161011d939))
* serve React SPA from Fastify in production mode ([d4ae4d5](https://github.com/ashim-hq/ashim/commit/d4ae4d586a60fe88f6834e5f32b89f7ef3d3bc7e))
* **storage:** add file storage helpers module ([7c37213](https://github.com/ashim-hq/ashim/commit/7c372135c8eb9d65198c0720bc2d0c83ac145004))
* **stores:** add Zustand store for Files page state management ([fb487be](https://github.com/ashim-hq/ashim/commit/fb487be051c6da6ca22a443323cf4788d4ca4e6b))
* **tool-factory:** auto-save results to persistent file store when fileId provided ([27d8629](https://github.com/ashim-hq/ashim/commit/27d8629c704bc9cabed8c7dd87c34ea8e9433347))
* **ui:** add teams, tools, feature flags, temp files, logo to settings dialog ([fbce0dd](https://github.com/ashim-hq/ashim/commit/fbce0dddd05c1e539bfbdb084c3b53d59f5dfd76))
* upgrade to BiRefNet SOTA background removal model ([f53937b](https://github.com/ashim-hq/ashim/commit/f53937b07006c6de26096467a106b0a055a4c95e))
* **web:** add before/after image comparison slider component ([64c8f90](https://github.com/ashim-hq/ashim/commit/64c8f908d7f188e079ff3bd5f469f5ab701cc25d))
* **web:** add fullscreen tool grid view ([86b716b](https://github.com/ashim-hq/ashim/commit/86b716b76514494a3611798e0651f8dc3601ce8b))
* **web:** add i18n architecture with English translations ([994cba7](https://github.com/ashim-hq/ashim/commit/994cba77164c6f1a1b092e76f9fa441077639079))
* **web:** add keyboard shortcuts for tool navigation ([e06e44c](https://github.com/ashim-hq/ashim/commit/e06e44cf2763265acfe97b14e863f22bd60dd264))
* **web:** add mobile responsive layout with bottom navigation ([ade6469](https://github.com/ashim-hq/ashim/commit/ade64699adbe54bbfed39f1a3cba924c3caeaef1))
* **web:** add pipeline builder UI with saved automations and templates ([39a7bf2](https://github.com/ashim-hq/ashim/commit/39a7bf259b25bc31575376bdec036f4693c5e777))
* **web:** add ProgressCard component ([ed69488](https://github.com/ashim-hq/ashim/commit/ed6948804b52ee5d8977732130a55c6c1efc358d))
* **web:** add ProgressCard to non-AI tool settings (Group A) ([17035e9](https://github.com/ashim-hq/ashim/commit/17035e98abc84f7abd0de91b9c0b324403a31c71))
* **web:** add settings dialog with general, security, API keys, and about sections ([bca8e81](https://github.com/ashim-hq/ashim/commit/bca8e81e3ad73a7f39451c8e3cc6d105f6665dcf))
* **web:** add ashim-style file preview, review panel, and tool chaining UX ([e12fc57](https://github.com/ashim-hq/ashim/commit/e12fc57ce101f7d68b718a2fb5bf3ea4884f69f2))
* **web:** add tool settings UI for all core image tools ([f9be6d6](https://github.com/ashim-hq/ashim/commit/f9be6d6eeff2ebe2d10fa69cc37993427f52ec76))
* **web:** migrate AI tool settings to ProgressCard ([eed4fc2](https://github.com/ashim-hq/ashim/commit/eed4fc28db80967aa3bb513459bf05d9b417d65f))
* **web:** redesign home page upload flow and add auth guard ([915a8cc](https://github.com/ashim-hq/ashim/commit/915a8cc2d5ecb8dc60b968cf85c5519a0c64cef6))
* **web:** rewrite useToolProcessor with XHR upload progress and SSE ([305f50b](https://github.com/ashim-hq/ashim/commit/305f50b5f4bd87cc19a3a8fe0d0374bb78bad101))
* wire up batch processing across tool settings components ([1d87091](https://github.com/ashim-hq/ashim/commit/1d87091bbc4bce9d8e78b0cddd474d21dd4dcd1c))

# [0.19.0](https://github.com/ashim-hq/ashim/compare/v0.18.0...v0.19.0) (2026-03-29)


### Features

* add privacy policy page and fix CSP blocking API docs ([3e314f0](https://github.com/ashim-hq/ashim/commit/3e314f032491c59196db3493d0b86f6aeec22c63))

# [0.18.0](https://github.com/ashim-hq/ashim/compare/v0.17.7...v0.18.0) (2026-03-29)


### Features

* add worker threads, persistent Python sidecar, graceful shutdown, and architectural improvements ([1274cc1](https://github.com/ashim-hq/ashim/commit/1274cc103fa2f0f934e9e2322c6034533ab62ec4))

## [0.17.7](https://github.com/ashim-hq/ashim/compare/v0.17.6...v0.17.7) (2026-03-28)


### Bug Fixes

* move health diagnostics behind admin auth ([ee9a20f](https://github.com/ashim-hq/ashim/commit/ee9a20f6a35a0681b3688f0e206914fceed8fd8c))
* reject HTML tags in settings API to prevent stored XSS ([d5bd011](https://github.com/ashim-hq/ashim/commit/d5bd01189766ee0797fe35ff3651f38f59a65881))
* simplify public health to static response, add 403 test ([9c05da6](https://github.com/ashim-hq/ashim/commit/9c05da6f1372abd071e5249b102d86fa294e0d22))
* switch README Docker references from GHCR to Docker Hub ([9e15679](https://github.com/ashim-hq/ashim/commit/9e1567971d50d755ef3b51d31e80b5a31a28ed2d))
* use two-pass validation in settings PUT to prevent partial writes ([2dc39d3](https://github.com/ashim-hq/ashim/commit/2dc39d353320b73d9abb96ee5ae1080c2ee2f9cb))

## [0.17.6](https://github.com/ashim-hq/ashim/compare/v0.17.5...v0.17.6) (2026-03-28)


### Bug Fixes

* resolve pipeline step race condition and infinite re-render loop ([e0177d4](https://github.com/ashim-hq/ashim/commit/e0177d405ef043a64f0b3a885e98169312be1fac))
* show checkerboard behind transparent images in before/after slider ([73741e6](https://github.com/ashim-hq/ashim/commit/73741e6efbdee53396810a2bb11eaf9597e4aa32))

## [0.17.5](https://github.com/ashim-hq/ashim/compare/v0.17.4...v0.17.5) (2026-03-28)


### Bug Fixes

* sync stepsRef during render, not useEffect ([0c86744](https://github.com/ashim-hq/ashim/commit/0c86744dda1073988c7e6bb55073f08e399c26f3))

## [0.17.4](https://github.com/ashim-hq/ashim/compare/v0.17.3...v0.17.4) (2026-03-28)


### Bug Fixes

* prevent stale closure in pipeline step callbacks ([c67f002](https://github.com/ashim-hq/ashim/commit/c67f0027804f167e250bd497505399c07b539c4e))

## [0.17.3](https://github.com/ashim-hq/ashim/compare/v0.17.2...v0.17.3) (2026-03-28)


### Bug Fixes

* clear search when adding a step from the tool picker ([ae2e63f](https://github.com/ashim-hq/ashim/commit/ae2e63f7fc4af3556539eee577b253c0616cbd0f))

## [0.17.2](https://github.com/ashim-hq/ashim/compare/v0.17.1...v0.17.2) (2026-03-28)


### Bug Fixes

* prevent pipeline step settings from resetting on collapse ([d899ef1](https://github.com/ashim-hq/ashim/commit/d899ef128004e46200da785a960da50894e93861))

## [0.17.1](https://github.com/ashim-hq/ashim/compare/v0.17.0...v0.17.1) (2026-03-28)


### Bug Fixes

* add remove-background settings to pipeline step configurator ([ae5ac81](https://github.com/ashim-hq/ashim/commit/ae5ac8134689e211f17534f3064995597b6337c8))

# [0.17.0](https://github.com/ashim-hq/ashim/compare/v0.16.4...v0.17.0) (2026-03-28)


### Features

* make AI tools pipeline-compatible and add search to tool picker ([2d46b09](https://github.com/ashim-hq/ashim/commit/2d46b096fa80e43f7a59e213ac884b5d1d30b586))

## [0.16.4](https://github.com/ashim-hq/ashim/compare/v0.16.3...v0.16.4) (2026-03-28)


### Bug Fixes

* surface hidden errors and add batch rejection tests ([2f8e2ce](https://github.com/ashim-hq/ashim/commit/2f8e2ce7e2b96613ebda249890632bc54c11980b))

## [0.16.3](https://github.com/ashim-hq/ashim/compare/v0.16.2...v0.16.3) (2026-03-28)


### Bug Fixes

* remove Google Drive coming soon placeholder from files nav ([e487fe0](https://github.com/ashim-hq/ashim/commit/e487fe06bf4cad6512100bf9660498e06c1047ba))

## [0.16.2](https://github.com/ashim-hq/ashim/compare/v0.16.1...v0.16.2) (2026-03-28)


### Bug Fixes

* pipeline only shows compatible tools and displays errors ([fe021c1](https://github.com/ashim-hq/ashim/commit/fe021c18b134c853262c8f0dac81c13f9ceeb435))

## [0.16.1](https://github.com/ashim-hq/ashim/compare/v0.16.0...v0.16.1) (2026-03-28)


### Bug Fixes

* trigger browser password save prompt on password change ([6b279ad](https://github.com/ashim-hq/ashim/commit/6b279ad09b9e74de34732b0e854f1180f25b34bd))

# [0.16.0](https://github.com/ashim-hq/ashim/compare/v0.15.0...v0.16.0) (2026-03-28)


### Features

* add password generator and browser save prompt on change-password page ([d56c644](https://github.com/ashim-hq/ashim/commit/d56c6446fee8384ab61ba180160f5e020a1e412e))

# [0.15.0](https://github.com/ashim-hq/ashim/compare/v0.14.2...v0.15.0) (2026-03-28)


### Features

* add forced password change page on first login ([e0900a8](https://github.com/ashim-hq/ashim/commit/e0900a877643c75266aeed5ac29501458ef0dcda))

## [0.14.2](https://github.com/ashim-hq/ashim/compare/v0.14.1...v0.14.2) (2026-03-28)


### Bug Fixes

* **tests:** remove temp DB cleanup that races with other test files ([498bfb3](https://github.com/ashim-hq/ashim/commit/498bfb3def2d6786fa5e387b3e30ede9768ef616))

## [0.14.1](https://github.com/ashim-hq/ashim/compare/v0.14.0...v0.14.1) (2026-03-28)


### Bug Fixes

* handle migration race condition in concurrent test workers ([d576ab1](https://github.com/ashim-hq/ashim/commit/d576ab1dfb1e9d2aa739c681c1f83d6fef3f7d22))

# [0.14.0](https://github.com/ashim-hq/ashim/compare/v0.13.1...v0.14.0) (2026-03-28)


### Features

* multi-arch Docker support, security hardening, and test improvements ([748d2b7](https://github.com/ashim-hq/ashim/commit/748d2b70460b3975a9c61edec0b121d788d0ee06))

## [0.13.1](https://github.com/ashim-hq/ashim/compare/v0.13.0...v0.13.1) (2026-03-27)


### Bug Fixes

* **docs:** remove hero logo from home page ([64c0ec8](https://github.com/ashim-hq/ashim/commit/64c0ec895f82b09e50d5ecf2b85f759f0a481232))

# [0.13.0](https://github.com/ashim-hq/ashim/compare/v0.12.1...v0.13.0) (2026-03-27)


### Features

* **docs:** add gem logo to GitHub Pages nav bar and home hero ([f0b8162](https://github.com/ashim-hq/ashim/commit/f0b8162955fa8f6b1891968163b4292b279f1ea1))

## [0.12.1](https://github.com/ashim-hq/ashim/compare/v0.12.0...v0.12.1) (2026-03-27)


### Bug Fixes

* **docs:** clean up footer llms.txt links ([e842cde](https://github.com/ashim-hq/ashim/commit/e842cde838ad3deb1437c4c43c8ccd796276248c))

# [0.12.0](https://github.com/ashim-hq/ashim/compare/v0.11.1...v0.12.0) (2026-03-27)


### Bug Fixes

* **api:** resolve team name lookup and show server error messages ([609fc8b](https://github.com/ashim-hq/ashim/commit/609fc8b6cc2d2408226e2576c35d7715bdf1498c))


### Features

* **docs:** add llms.txt links to GitHub Pages footer ([b874445](https://github.com/ashim-hq/ashim/commit/b874445dc6d31c54a095d7471390e664b233d491))

## [0.11.1](https://github.com/ashim-hq/ashim/compare/v0.11.0...v0.11.1) (2026-03-27)


### Bug Fixes

* **docs:** ignore localhost dead links in VitePress build ([78269d4](https://github.com/ashim-hq/ashim/commit/78269d499c914d5d68c4455475a1608f4af2a075))

# [0.11.0](https://github.com/ashim-hq/ashim/compare/v0.10.0...v0.11.0) (2026-03-27)


### Bug Fixes

* **a11y:** add aria-hidden to decorative GemLogo SVG ([ae185ce](https://github.com/ashim-hq/ashim/commit/ae185ce767a480719d2f54d5675cbd7d64beb7b5))
* **api:** allow Scalar docs through auth and CSP ([6023109](https://github.com/ashim-hq/ashim/commit/6023109df9c66c1e7b4d81f3e902f081809ed6ba))
* **api:** use content instead of spec.content for Scalar v1.49 API ([dfcb4d5](https://github.com/ashim-hq/ashim/commit/dfcb4d579f4b44013d23dff8617d9a9f6315b452))
* **ui:** clean up settings, automate page, fullscreen logo, and README ([b3c8ad4](https://github.com/ashim-hq/ashim/commit/b3c8ad4697000454a11aaace27d0baa37a9959d9))


### Features

* **api:** add all remaining endpoints to OpenAPI spec ([e7b38ba](https://github.com/ashim-hq/ashim/commit/e7b38ba68f8ae7fae5675bafc0f2dc2c4f22ecd2))
* **api:** add all tool endpoints to OpenAPI spec ([753ba3e](https://github.com/ashim-hq/ashim/commit/753ba3e4689b1a3504960d15d1ebceaf2a08876e))
* **api:** add llms.txt and llms-full.txt endpoints ([12ba52a](https://github.com/ashim-hq/ashim/commit/12ba52a6a0c1260f02a4d7787be8113383575d9e))
* **api:** add OpenAPI 3.1 spec skeleton with common schemas ([b2189f5](https://github.com/ashim-hq/ashim/commit/b2189f556815ef8d5c781eee72b8263db09f6a1a))
* **api:** add Scalar docs route and install dependency ([6f2c319](https://github.com/ashim-hq/ashim/commit/6f2c3190b8414d1c4c3b1a78cf7a86a96109c934))
* **api:** register docs route in server and test helper ([bc6b389](https://github.com/ashim-hq/ashim/commit/bc6b38918ff11f1027efeb934ae0e56d6068b81f))
* **branding:** add faceted gem SVG logo assets ([4bc9335](https://github.com/ashim-hq/ashim/commit/4bc93351541b039534197821d290d34cad12c9a7))
* **branding:** add favicon and meta tags to index.html ([2508fd0](https://github.com/ashim-hq/ashim/commit/2508fd04871cdb776523ec9d602ad934283c6211))
* **branding:** add OG social preview image ([c6c5b92](https://github.com/ashim-hq/ashim/commit/c6c5b926e271d457effea9aec07b70bbc7227ef5))
* **branding:** add PWA manifest and PNG logo assets ([298567d](https://github.com/ashim-hq/ashim/commit/298567d090f298600b334184b09d35c178097362))
* **branding:** show gem icon in app header as default logo ([dd857fb](https://github.com/ashim-hq/ashim/commit/dd857fbcc778a2425806f1d96d83f118dc92831a))
* **docs:** add gem favicon to VitePress site ([0918f93](https://github.com/ashim-hq/ashim/commit/0918f933719ae0d8ff16cf7a8ac0e8936e90805a))
* **docs:** add llms.txt and llms-full.txt to GitHub Pages ([5f6959a](https://github.com/ashim-hq/ashim/commit/5f6959a21e3b2708edb011a0a7ce48fbfbc64c87))

# [0.10.0](https://github.com/ashim-hq/ashim/compare/v0.9.0...v0.10.0) (2026-03-26)


### Bug Fixes

* **ocr:** update PaddleOCR for v3 API and add Tesseract fallback ([e260a93](https://github.com/ashim-hq/ashim/commit/e260a93cf65f1e7cd22b7b5d491c6125fee8c915))


### Features

* **erase-object:** replace mask upload with in-browser brush painting ([40e3081](https://github.com/ashim-hq/ashim/commit/40e30815915f18f9f7fc25c05a61c643f1dfdbe4))

# [0.9.0](https://github.com/ashim-hq/ashim/compare/v0.8.2...v0.9.0) (2026-03-26)


### Bug Fixes

* **blur-faces:** switch from MediaPipe to OpenCV and auto-orient images ([dc10f90](https://github.com/ashim-hq/ashim/commit/dc10f905c62c662f1a40701c81874e5854ea33e6))
* **docker:** add build layer caching for faster Docker rebuilds ([03ba30d](https://github.com/ashim-hq/ashim/commit/03ba30d8f01c5c2500641d934b08a875589bcd68))
* **upscale:** auto-orient images before upscaling and improve UI ([8a6e665](https://github.com/ashim-hq/ashim/commit/8a6e665a4484bda1e4b93b520c393bb707a624aa))


### Features

* **adjustments:** add real-time live preview for all color tools ([b5c924e](https://github.com/ashim-hq/ashim/commit/b5c924e0fc7468c6364ef320958cea2e5ef18420))
* **image-to-pdf:** add live PDF page preview with margin visualization ([cd666ea](https://github.com/ashim-hq/ashim/commit/cd666eaef0b13bcd9223439f0bbb5efd88b2f25e))
* **rotate:** add editable angle input and fine-tune +/- buttons ([e1f04c2](https://github.com/ashim-hq/ashim/commit/e1f04c28a6b03c0503266c0e78e7a9161011d939))

## [0.8.2](https://github.com/ashim-hq/ashim/compare/v0.8.1...v0.8.2) (2026-03-25)


### Bug Fixes

* **test:** add missing PNG fixture files to repo ([45c6b9d](https://github.com/ashim-hq/ashim/commit/45c6b9de08124fb357ac759e43c4fbf1eb5fbfb9))
* **test:** exclude e2e tests from vitest and fix CI test suite ([9d28485](https://github.com/ashim-hq/ashim/commit/9d28485339e17b80586cea91bd18dafc989d7f24))

## [0.8.1](https://github.com/ashim-hq/ashim/compare/v0.8.0...v0.8.1) (2026-03-25)


### Bug Fixes

* resolve test failures from shared DB race conditions ([1a7116d](https://github.com/ashim-hq/ashim/commit/1a7116d79072d131b94d1c454abbc32b9e961c1b))

# [0.8.0](https://github.com/ashim-hq/ashim/compare/v0.7.0...v0.8.0) (2026-03-25)


### Bug Fixes

* **docker:** skip husky prepare script in production install ([fdfb0a0](https://github.com/ashim-hq/ashim/commit/fdfb0a0e7412c86e3b85a70daf5093f44c34ee99))
* prevent useAuth infinite loop causing rate limit storms ([9624dae](https://github.com/ashim-hq/ashim/commit/9624dae1569b6f2ad52ce990fc84eca809b849a8))


### Features

* **api:** add logo upload/serve/delete routes with tests ([6063f4d](https://github.com/ashim-hq/ashim/commit/6063f4daa98acf3f03e004a588de562e377105c7))
* **api:** add persistent file management helpers to frontend api module ([ecbfcce](https://github.com/ashim-hq/ashim/commit/ecbfcceec82010fa44244c6839928b9930d59b5a))
* **api:** add teams CRUD routes and update auth team references ([ec22e53](https://github.com/ashim-hq/ashim/commit/ec22e53a3b15ae030743e76db0d57584000727b6))
* **api:** add tool filtering and DB-backed cleanup settings ([07e7e8d](https://github.com/ashim-hq/ashim/commit/07e7e8d58d311d89f43cee1c7fa21dd0eb4c9dfb))
* **api:** add user files CRUD routes at /api/v1/files/* ([6a07007](https://github.com/ashim-hq/ashim/commit/6a070071456611d2bf2acf4a474be8c43680e1b0))
* **db:** add teams table and migration ([365783b](https://github.com/ashim-hq/ashim/commit/365783b6dc1f5cfa631bb4f6915fcf99d91f574d))
* **db:** add userFiles table and migration ([a2fdbd5](https://github.com/ashim-hq/ashim/commit/a2fdbd5fef2cf02f90692166d6386c5ac21c2cef))
* **env:** add FILES_STORAGE_PATH config variable ([3c737a6](https://github.com/ashim-hq/ashim/commit/3c737a6c724f4862d302bf22a75ebcd745f0df4c))
* **files:** add Files page with nav, list, details, upload, and routing ([3f127a4](https://github.com/ashim-hq/ashim/commit/3f127a457e8a7a07d22fdf8776c3166092db562f))
* **files:** add mobile layout for Files page ([e864d1e](https://github.com/ashim-hq/ashim/commit/e864d1e430bd516ccbe1732ec7451e1e7d670177))
* **files:** wire serverFileId for version tracking ([8868d3e](https://github.com/ashim-hq/ashim/commit/8868d3e556beedcff35de268e72241e7f10998a3))
* **i18n:** add translation keys for settings phase 1 ([c5ff80a](https://github.com/ashim-hq/ashim/commit/c5ff80acfbe18b953cfd96a88498fc70b82b541e))
* implement Files page with persistent storage and version tracking ([f6183d2](https://github.com/ashim-hq/ashim/commit/f6183d2c62e6ad04dec3fe0250468cbfd6cbc035))
* **storage:** add file storage helpers module ([7c37213](https://github.com/ashim-hq/ashim/commit/7c372135c8eb9d65198c0720bc2d0c83ac145004))
* **stores:** add Zustand store for Files page state management ([fb487be](https://github.com/ashim-hq/ashim/commit/fb487be051c6da6ca22a443323cf4788d4ca4e6b))
* **tool-factory:** auto-save results to persistent file store when fileId provided ([27d8629](https://github.com/ashim-hq/ashim/commit/27d8629c704bc9cabed8c7dd87c34ea8e9433347))
* **ui:** add teams, tools, feature flags, temp files, logo to settings dialog ([fbce0dd](https://github.com/ashim-hq/ashim/commit/fbce0dddd05c1e539bfbdb084c3b53d59f5dfd76))

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Files page — persistent server-side storage with version tracking and a mobile layout
- Teams — full CRUD API, database table, and migration
- Admin settings panel covering teams, tool visibility, feature flags, temp file cleanup, and logo upload
- Branding API routes (logo upload, serve, delete)
- Tool filtering and DB-backed cleanup settings on the API side
- i18n keys for the new settings screens
- `userFiles` table for persistent file management
- `FILES_STORAGE_PATH` config variable for controlling where uploaded files live
- Tool results auto-save to persistent storage when a `fileId` is provided

### Changed

- Renamed `Tool.alpha` to `Tool.experimental` everywhere
- Tightened TypeScript types in tool-factory registry (removed `any` casts)
- Bumped login attempt limit from 5 to 10
- Switched `isNaN` to `Number.isNaN` in cleanup interval parsing
- Null-safe team lookup in auth registration

### Removed

- Internal planning docs (`docs/superpowers/`) and AI tool config from version control - these stay local only

## [0.7.0] - 2026-03-24

### Added

- Inline settings configuration for pipeline automation steps, allowing per-step parameter overrides

### Security

- Hardened authentication with stricter session validation
- Added security headers (HSTS, CSP, X-Content-Type-Options)
- SVG sanitization on upload to prevent XSS via malicious SVGs
- Pipeline ownership enforcement — users can only execute their own pipelines

## [0.6.0] - 2026-03-24

### Added

- Extracted reusable auto-orient utility from image processing pipeline
- Expanded integration test coverage across tool routes

## [0.5.2] - 2026-03-23

### Fixed

- Restored `APP_VERSION` import used by the `/health` endpoint, fixing version reporting in production

## [0.5.1] - 2026-03-23

### Fixed

- Crop tool now uses `percentCrop` from `onChange` callback, fixing inflated pixel values that produced incorrect crop regions

### Changed

- Removed unused Swagger dependencies, reducing bundle size
- Parallelized CI jobs for faster pipeline execution

## [0.5.0] - 2026-03-23

### Added

- **Interactive crop tool** with visual overlay, grid lines, aspect ratio presets, pixel input fields, and keyboard controls
- **Multi-image support** — upload and process multiple files with arrow navigation and filmstrip thumbnail strip
- Batch processing wired across all tool settings with `processAllFiles` method
- `clientJobId` correlation for SSE progress during batch operations
- Side-by-side comparison view for resize results
- Live CSS transform preview for rotate/flip operations
- Redesigned resize settings with tabbed UI (presets, custom dimensions, scale percentage)
- Client-side ZIP extraction via `fflate` for batch result downloads
- Per-file metadata display with caching

### Fixed

- White screen crash when uploading photos with null GPS EXIF data
- TypeScript `Uint8Array` type incompatibility with `fflate`

## [0.4.1] - 2026-03-23

### Fixed

- Unified all services on port 1349 (was split across multiple ports)
- Strip-metadata tool now correctly removes all EXIF data
- Before/after slider and side-by-side comparison component rendering fixes

## [0.4.0] - 2026-03-23

### Added

- **Resize tool redesign** with tabbed settings UI — presets, custom dimensions, and scale percentage
- **Rotate/flip live preview** using CSS transforms before server round-trip
- Side-by-side comparison component for visual before/after on resize
- Conditional result views — side-by-side for resize, live preview for rotate

### Fixed

- CI/CD pipeline — removed broken AI docs updater workflow, fixed Docker publish job

## [0.3.1] - 2026-03-23

### Fixed

- CI workflow failure: `tsx` binary not found in AI docs updater action

## [0.3.0] - 2026-03-23

### Added

- **Real progress bars** replacing indeterminate spinners across all tools
- SSE-based progress streaming from Python AI scripts through the API to the frontend
- `ProgressCard` component with determinate progress display for all tool types
- `useToolProcessor` hook rewritten with XHR upload progress and SSE event streaming
- `onProgress` callback support in all AI wrapper functions (rembg, RealESRGAN, PaddleOCR, MediaPipe, LaMa)
- `emit_progress()` calls in all Python AI scripts for granular status updates
- Intuitive subject/quality selector replacing raw model dropdown in background removal tool

### Fixed

- Progress bar no longer resets from 100% to 0% between processing stages
- `setError(null)` no longer overrides `setProcessing(true)` race condition
- SSE progress endpoint added to public auth paths (was returning 401)

## [0.2.1] - 2026-03-22

### Added

- **Monorepo foundation** — Turborepo with pnpm workspaces (`apps/api`, `apps/web`, `apps/docs`, `packages/shared`, `packages/image-engine`, `packages/ai`)
- **Fastify API server** with health check, environment config, and SQLite database via Drizzle ORM
- **Authentication system** with default admin user, login page, and session management
- **React SPA** with Vite, Tailwind CSS, dark/light/system theme, and sidebar layout
- **14 Sharp-based image operations** — resize, crop, rotate, convert, compress, metadata strip, color adjust, and more
- **Generic tool route factory** for declarative API endpoint creation
- **Tool settings UI** for all core image tools with before/after comparison slider
- **Batch processing** with ZIP download and SSE progress tracking
- **30+ tools** including watermark, text overlay, composition, collage, splitting, border/frame, image info, compare, duplicates, color palette, QR code, barcode, replace-color, SVG-to-raster, vectorize, GIF, favicon, and image-to-PDF
- **6 AI-powered tools** via Python sidecar — background removal, upscaling, OCR, face detection/blur, object erasure (LaMa inpainting)
- **Pipeline system** — builder UI with templates, execution/save/list API endpoints
- i18n architecture with English translations
- Keyboard shortcuts for tool navigation
- Mobile responsive layout with bottom navigation
- Fullscreen tool grid view
- Settings dialog (general, security, API keys, about)
- API key management routes
- Home page redesign with upload flow and auth guard
- Multi-stage Docker build with Python ML dependencies
- Playwright end-to-end test suite
- VitePress documentation site with GitHub Pages deployment
- GitHub Actions CI pipeline and Docker Hub auto-publish workflow
- Semantic-release for automated versioning
- Swagger/OpenAPI documentation at `/api/docs`
- Automatic workspace file cleanup cron

### Fixed

- Python bridge ENOENT handling for venv fallback — no longer swallows script errors
- Port configuration unified to 1349 for the UI across all modes
- Home upload flow, auth redirect, and form submit handling bugs
- Background removal defaults to U2-Net (fast, ~2s) instead of slow BiRefNet

[Unreleased]: https://github.com/ashim-hq/ashim/compare/v0.7.0...HEAD
[0.7.0]: https://github.com/ashim-hq/ashim/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/ashim-hq/ashim/compare/v0.5.2...v0.6.0
[0.5.2]: https://github.com/ashim-hq/ashim/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/ashim-hq/ashim/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/ashim-hq/ashim/compare/v0.4.1...v0.5.0
[0.4.1]: https://github.com/ashim-hq/ashim/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/ashim-hq/ashim/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/ashim-hq/ashim/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/ashim-hq/ashim/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/ashim-hq/ashim/releases/tag/v0.2.1
