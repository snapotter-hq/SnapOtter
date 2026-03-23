## [0.5.2](https://github.com/siddharthksah/Stirling-Image/compare/v0.5.1...v0.5.2) (2026-03-23)


### Bug Fixes

* restore APP_VERSION import used by health endpoint ([2a74b60](https://github.com/siddharthksah/Stirling-Image/commit/2a74b604466193994bcc87ba2ef589f4c15d9547))

## [0.5.1](https://github.com/siddharthksah/Stirling-Image/compare/v0.5.0...v0.5.1) (2026-03-23)


### Bug Fixes

* **crop:** use percentCrop from onChange to fix inflated pixel values ([f238820](https://github.com/siddharthksah/Stirling-Image/commit/f2388206324e4ddc6114b91421ca8bcb634fc340))

# [0.5.0](https://github.com/siddharthksah/Stirling-Image/compare/v0.4.1...v0.5.0) (2026-03-23)


### Bug Fixes

* resolve TypeScript Uint8Array type error with fflate ([c1b06b3](https://github.com/siddharthksah/Stirling-Image/commit/c1b06b37f2cf2aef6971f1b16b5691ce7d932b87))
* white screen crash when uploading photos with null GPS EXIF data ([c913df9](https://github.com/siddharthksah/Stirling-Image/commit/c913df9c0eccb0a1d0ff305cc6dcb1c99ddf96f4))


### Features

* accept clientJobId in batch endpoint for SSE progress correlation ([8ed57f4](https://github.com/siddharthksah/Stirling-Image/commit/8ed57f400fd083fbef7528f51231f59ecd3b1bee))
* add CSS transform props to ImageViewer for live rotate/flip preview ([7627853](https://github.com/siddharthksah/Stirling-Image/commit/762785394b2e66a25ee858da96868cd752942a7d))
* add live preview callback to RotateSettings, rename button to Apply ([06844ec](https://github.com/siddharthksah/Stirling-Image/commit/06844ec1ada4d5685691f26655ecb8712b4d94d9))
* add MultiImageViewer with arrow navigation and filmstrip ([1fa8747](https://github.com/siddharthksah/Stirling-Image/commit/1fa874758ca58efb4b9f68d76a02648d6a84abfe))
* add processAllFiles batch method to tool processor hook ([cd1e180](https://github.com/siddharthksah/Stirling-Image/commit/cd1e18026fb4b866c4bbde6c259412674a501f05))
* add SideBySideComparison component for resize results ([2d0ba5a](https://github.com/siddharthksah/Stirling-Image/commit/2d0ba5a65683b45a6382ca1aea9f7a75d1143702))
* add ThumbnailStrip filmstrip component ([9caa613](https://github.com/siddharthksah/Stirling-Image/commit/9caa613883a7f0f0ccfbb268d3e88596e92ce094))
* conditional result views — side-by-side for resize, live preview for rotate ([6682649](https://github.com/siddharthksah/Stirling-Image/commit/668264990c33667e586e4e24703f1957b18e1c0c))
* **crop:** add CropCanvas component with visual overlay, grid, and keyboard controls ([018bbf4](https://github.com/siddharthksah/Stirling-Image/commit/018bbf44bfed4acf475de49ff9f3f5c20ee63295))
* **crop:** add react-image-crop dependency ([b7ecd41](https://github.com/siddharthksah/Stirling-Image/commit/b7ecd41897de4f48e6f970dfbb1188848e9bcd2a))
* **crop:** redesign CropSettings with aspect presets, pixel inputs, and grid toggle ([d75f458](https://github.com/siddharthksah/Stirling-Image/commit/d75f458dc0f13e69640bc012adea0ee29d02b82b))
* **crop:** wire CropCanvas and CropSettings into tool-page with bidirectional state ([ea7fb46](https://github.com/siddharthksah/Stirling-Image/commit/ea7fb46f7ecad5639c007ba43d652fd72c75b39f))
* integrate MultiImageViewer and multi-file UX into tool page ([52aab1e](https://github.com/siddharthksah/Stirling-Image/commit/52aab1e2bf5f938a800a78b4e5c11f5ad9fbae27))
* merge multi-image UX — batch processing, filmstrip navigation, resize/rotate redesign ([9bfdb75](https://github.com/siddharthksah/Stirling-Image/commit/9bfdb75f5c205906f2bd62d496e96d6b402e1dc1))
* multi-file metadata display with per-file caching ([42b59f3](https://github.com/siddharthksah/Stirling-Image/commit/42b59f3e2d84b3d9fd6724b9ed9fb272fb11201a))
* rewrite file-store with FileEntry model for multi-image support ([abbb3e4](https://github.com/siddharthksah/Stirling-Image/commit/abbb3e4d6e8f21f35b385c51fb659010099556d1))
* rewrite resize settings with tab-based UI (presets, custom, scale) ([3b39a8c](https://github.com/siddharthksah/Stirling-Image/commit/3b39a8cc5f11a5093f42bcdbe97989fce3841616))
* wire up batch processing across tool settings components ([1d87091](https://github.com/siddharthksah/Stirling-Image/commit/1d87091bbc4bce9d8e78b0cddd474d21dd4dcd1c))

## [0.4.1](https://github.com/siddharthksah/Stirling-Image/compare/v0.4.0...v0.4.1) (2026-03-23)


### Bug Fixes

* unify project on port 1349, improve strip-metadata and UI components ([4912ee3](https://github.com/siddharthksah/Stirling-Image/commit/4912ee37e961b9ba9748d7ffa9164d7ca5ae0abb))

# [0.4.0](https://github.com/siddharthksah/Stirling-Image/compare/v0.3.1...v0.4.0) (2026-03-23)


### Bug Fixes

* streamline CI/CD — remove broken AI docs updater, fix Docker publish ([ad2c96d](https://github.com/siddharthksah/Stirling-Image/commit/ad2c96d7b86b55b602e973f5da30d517605ed5cd))


### Features

* add CSS transform props to ImageViewer for live rotate/flip preview ([de3340f](https://github.com/siddharthksah/Stirling-Image/commit/de3340fc5b201cc5c046cbb38a274e7dfa026b41))
* add live preview callback to RotateSettings, rename button to Apply ([17be50b](https://github.com/siddharthksah/Stirling-Image/commit/17be50b213e1ca6d1d6e8d949b65de70c68d108d))
* add SideBySideComparison component for resize results ([d037305](https://github.com/siddharthksah/Stirling-Image/commit/d037305f29a32ead0addf6d79ace4823c9ba0e2b))
* conditional result views — side-by-side for resize, live preview for rotate ([f0d18be](https://github.com/siddharthksah/Stirling-Image/commit/f0d18bee5ebc110e63bb3cf9fd829d80900759ce))
* rewrite resize settings with tab-based UI (presets, custom, scale) ([b9f3ac0](https://github.com/siddharthksah/Stirling-Image/commit/b9f3ac0d222f3712d35becd6c831dc62f728a16a))

## [0.3.1](https://github.com/siddharthksah/Stirling-Image/compare/v0.3.0...v0.3.1) (2026-03-23)


### Bug Fixes

* resolve tsx not found in AI docs updater workflow ([dfbef8d](https://github.com/siddharthksah/Stirling-Image/commit/dfbef8d723dcc2960187db36676107f708707e33))

# [0.3.0](https://github.com/siddharthksah/Stirling-Image/compare/v0.2.1...v0.3.0) (2026-03-23)


### Bug Fixes

* add SSE progress endpoint to public paths ([18c3da0](https://github.com/siddharthksah/Stirling-Image/commit/18c3da0d41cba74c55fffd1a9f58c1a8ee5d5574))
* apply continuous progress bar to erase-object and OCR ([196c553](https://github.com/siddharthksah/Stirling-Image/commit/196c553af57bb9efbd32282dd24fc080fb7228dd))
* continuous progress bar (no 100%→0% reset) ([b4abefe](https://github.com/siddharthksah/Stirling-Image/commit/b4abefe94776a1b9a9700f469e56de060c7626ca))
* setError(null) was overriding setProcessing(true) ([2be94b7](https://github.com/siddharthksah/Stirling-Image/commit/2be94b77b2b288086b55101e6854bf0407935b28))


### Features

* **ai:** add emit_progress() calls to all Python AI scripts ([eb6f57d](https://github.com/siddharthksah/Stirling-Image/commit/eb6f57dfa35fa10ada4493e9fd73fe4d4788c03c))
* **ai:** add onProgress callback to all AI wrapper functions ([021c9f1](https://github.com/siddharthksah/Stirling-Image/commit/021c9f12b5a1aca6c6c7cb8c9d9fad3d0406ab94))
* **ai:** rewrite bridge.ts to stream stderr progress via spawn ([9d9c45a](https://github.com/siddharthksah/Stirling-Image/commit/9d9c45a04c2a85e99021a35a3da94e1e19cb9043))
* **api:** add SingleFileProgress type and SSE update function ([12b85d4](https://github.com/siddharthksah/Stirling-Image/commit/12b85d4def1f29ca291d6f5e538181f2bcbcf774))
* **api:** wire AI route handlers to SSE progress via clientJobId ([a3f85da](https://github.com/siddharthksah/Stirling-Image/commit/a3f85da20f73f02cd5ec141519aa73fcfeb2157b))
* replace model dropdown with intuitive subject/quality selector in remove-bg ([bc26d60](https://github.com/siddharthksah/Stirling-Image/commit/bc26d60d54a47a9fb6f58115131845d1ae5ee868))
* **web:** add ProgressCard component ([ed69488](https://github.com/siddharthksah/Stirling-Image/commit/ed6948804b52ee5d8977732130a55c6c1efc358d))
* **web:** add ProgressCard to non-AI tool settings (Group A) ([17035e9](https://github.com/siddharthksah/Stirling-Image/commit/17035e98abc84f7abd0de91b9c0b324403a31c71))
* **web:** migrate AI tool settings to ProgressCard ([eed4fc2](https://github.com/siddharthksah/Stirling-Image/commit/eed4fc28db80967aa3bb513459bf05d9b417d65f))
* **web:** rewrite useToolProcessor with XHR upload progress and SSE ([305f50b](https://github.com/siddharthksah/Stirling-Image/commit/305f50b5f4bd87cc19a3a8fe0d0374bb78bad101))
