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
