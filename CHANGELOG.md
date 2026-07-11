# [2.1.0](https://github.com/snapotter-hq/snapotter/compare/v2.0.0...v2.1.0) (2026-07-10)


### Bug Fixes

* **demo:** boot to dashboard, sample-data notice, robust mobile editor icon ([#464](https://github.com/snapotter-hq/snapotter/issues/464)) ([a94b69b](https://github.com/snapotter-hq/snapotter/commit/a94b69b14f783c07abfe757e21314f580fbda556))
* **demo:** point banner "Self-host SnapOtter" link at the docs guide ([#466](https://github.com/snapotter-hq/snapotter/issues/466)) ([463ccff](https://github.com/snapotter-hq/snapotter/commit/463ccff5cb91c4b2d0f2c7309ea77789544ad2c3))
* **demo:** populate admin data, fix settings crash and mobile editor icon ([#463](https://github.com/snapotter-hq/snapotter/issues/463)) ([7329bc6](https://github.com/snapotter-hq/snapotter/commit/7329bc6a1334b925cf95384d6ddc172f04a86610))
* error-only Sentry telemetry, storm-proof capture, and crash fixes ([#476](https://github.com/snapotter-hq/snapotter/issues/476)) ([ae6a4c8](https://github.com/snapotter-hq/snapotter/commit/ae6a4c8b7c9275ccd8930251d429181568f83453))
* **landing:** clarify OIDC is free, SAML is enterprise on pricing ([#461](https://github.com/snapotter-hq/snapotter/issues/461)) ([c2c9a9e](https://github.com/snapotter-hq/snapotter/commit/c2c9a9ed9bea9c66efec84b9e0b9b2ebbf863073))
* **landing:** fix top nav overflow and text overlap ([#473](https://github.com/snapotter-hq/snapotter/issues/473)) ([ffeacd4](https://github.com/snapotter-hq/snapotter/commit/ffeacd4b3c7b5858d9048c2521569256e3569490))
* **landing:** green the landing e2e suite ([#470](https://github.com/snapotter-hq/snapotter/issues/470)) ([10ae6d1](https://github.com/snapotter-hq/snapotter/commit/10ae6d1d3d6ce8a527937bfa31e76ba392bc09e0))
* **landing:** highlight Open Source as Most Popular tier ([#462](https://github.com/snapotter-hq/snapotter/issues/462)) ([e468cef](https://github.com/snapotter-hq/snapotter/commit/e468cef6c0e28b4736dee32d2cf8c2ab1968a59c))
* **landing:** reposition residual meta framing and demote homepage tool count ([#471](https://github.com/snapotter-hq/snapotter/issues/471)) ([958c3e8](https://github.com/snapotter-hq/snapotter/commit/958c3e8513eb3a4c3be7488894981fc8794b1c5f))
* reliable, self-healing AI feature-bundle installs ([#472](https://github.com/snapotter-hq/snapotter/issues/472)) ([a731c3d](https://github.com/snapotter-hq/snapotter/commit/a731c3d1fe8303296e90cd138a01e903df871bb7))
* restyle sponsor button ([37a3cfc](https://github.com/snapotter-hq/snapotter/commit/37a3cfc84477c10831f9ae61f183f4ab4ef45d50))
* reword sponsor button to "Support us" ([#468](https://github.com/snapotter-hq/snapotter/issues/468)) ([331e3bf](https://github.com/snapotter-hq/snapotter/commit/331e3bfde04035151612275d9ae269909fed87a8))
* update python protobuf dependency ([780624e](https://github.com/snapotter-hq/snapotter/commit/780624e168cfda5abf3b2501455fe62674550fcf))


### Features

* **demo:** populate the Files library with sample files ([#465](https://github.com/snapotter-hq/snapotter/issues/465)) ([a6e8f75](https://github.com/snapotter-hq/snapotter/commit/a6e8f75074e38b8e5d856311d4423e8a936ae690))
* **landing:** add dismissible 2.0 launch banner ([ea7a671](https://github.com/snapotter-hq/snapotter/commit/ea7a671ccf29bcbab7a94c28efcbf6e1b9506b34))
* **landing:** add Product dropdown to nav ([#475](https://github.com/snapotter-hq/snapotter/issues/475)) ([3d1744a](https://github.com/snapotter-hq/snapotter/commit/3d1744aec84049f1f296f1cce8f6fb726cf7f835))
* **landing:** restore Developers nav link, swap out Features anchor ([#474](https://github.com/snapotter-hq/snapotter/issues/474)) ([a08afbc](https://github.com/snapotter-hq/snapotter/commit/a08afbc80afefb11cbc13e629d31225a6dceda2f))
* reposition to self-hosted file-processing infrastructure ([#469](https://github.com/snapotter-hq/snapotter/issues/469)) ([af011d5](https://github.com/snapotter-hq/snapotter/commit/af011d55381f8b57797984b1c5b2ca974a033d1c))

# [2.0.0](https://github.com/snapotter-hq/snapotter/compare/v1.17.2...v2.0.0) (2026-07-07)


* feat!: SnapOtter 2.0.0 ([6205525](https://github.com/snapotter-hq/snapotter/commit/620552569e1b6b163df66ee824a480e6d5750abb)), closes [#254](https://github.com/snapotter-hq/snapotter/issues/254) [#261](https://github.com/snapotter-hq/snapotter/issues/261)
* feat(db)!: SnapOtter 2.0 phase 1 foundation: postgres, migrator, compose stack ([#216](https://github.com/snapotter-hq/snapotter/issues/216)) ([1c724d5](https://github.com/snapotter-hq/snapotter/commit/1c724d5d21659be24423a22c7d6737d59b3d6310))


### Bug Fixes

* adopt sharp 0.35.2+ by centralizing the FormatEnum key type ([#362](https://github.com/snapotter-hq/snapotter/issues/362)) ([9052da2](https://github.com/snapotter-hq/snapotter/commit/9052da27f3a298f950a9949a0e0929e72b569b04))
* **ai-bundles:** lock the numpy-1.x ABI closure so the OCR bundle can't strand scipy ([67c5566](https://github.com/snapotter-hq/snapotter/commit/67c55669d610801e8cd07e4d65c5642a08fc0b07))
* **ai-bundles:** lock the numpy-1.x ABI closure so the OCR bundle can't strand scipy ([#437](https://github.com/snapotter-hq/snapotter/issues/437)) ([fd39f66](https://github.com/snapotter-hq/snapotter/commit/fd39f66f464e21836e8cfd72ab38f3d5c6d3528f))
* **ai-bundles:** repair bundle build + publish pipeline (deepsafe repo, CPU provider, manifest) ([3b50bcd](https://github.com/snapotter-hq/snapotter/commit/3b50bcdc5ccb630998c60003d5eddd9803780013))
* **ai:** broaden SSRF pre-scan regex to cover srcset, poster, formaction, [@import](https://github.com/import) ([5397f9b](https://github.com/snapotter-hq/snapotter/commit/5397f9b21c5b8566fed355f13d62378035456981))
* **ai:** detect a paddle-only GPU so OCR uses PaddleOCR-GPU not Tesseract ([#439](https://github.com/snapotter-hq/snapotter/issues/439)) ([7cd514d](https://github.com/snapotter-hq/snapotter/commit/7cd514dd8cdee28b9f600722f43ba63bcdbe2928))
* **ai:** enforce the feature gate on the per-request fallback path ([#331](https://github.com/snapotter-hq/snapotter/issues/331)) ([7a70aff](https://github.com/snapotter-hq/snapotter/commit/7a70affac51153cf0bd6432a7d9bdc4e6c76bc4b)), closes [#327](https://github.com/snapotter-hq/snapotter/issues/327)
* **ai:** gate AI tools on per-framework GPU detection, not a shared boolean ([#445](https://github.com/snapotter-hq/snapotter/issues/445)) ([36dde9a](https://github.com/snapotter-hq/snapotter/commit/36dde9ad8784867270bbfe766650b4c4515dbcb9))
* **ai:** pin protobuf<5 on arm64 so mediapipe face landmarks work ([#417](https://github.com/snapotter-hq/snapotter/issues/417)) ([2c2fb65](https://github.com/snapotter-hq/snapotter/commit/2c2fb65fcaaa835ca589e59255366819cece5fdf))
* **ai:** pin rembg to 2.0.69 to keep numpy<2 compatibility ([3726335](https://github.com/snapotter-hq/snapotter/commit/3726335063984bd572a14eea36c532bda74bc1d6))
* **ai:** surface actionable fix for libGL.so.1 missing on headless installs ([7c70c60](https://github.com/snapotter-hq/snapotter/commit/7c70c60b9e3e0912b1f8be6acf87f378f8b9c080))
* **ai:** update arm64 bundle sha256/size after protobuf<5 rebuild ([#421](https://github.com/snapotter-hq/snapotter/issues/421)) ([2a36b3d](https://github.com/snapotter-hq/snapotter/commit/2a36b3dfe0e4388f7bd1c2a8183f7d87e57dc144)), closes [#417](https://github.com/snapotter-hq/snapotter/issues/417)
* allow reinstall of AI bundles with broken model files ([#214](https://github.com/snapotter-hq/snapotter/issues/214)) ([27a56c7](https://github.com/snapotter-hq/snapotter/commit/27a56c774bfd8f920355a1f5b70553639ad165df))
* always show NonNativePreview for non-native formats, even after processing ([abaae18](https://github.com/snapotter-hq/snapotter/commit/abaae18669a281a03aeafebec764f9992659c862))
* **analytics:** harden analytics opt-out and feedback surfaces ([#423](https://github.com/snapotter-hq/snapotter/issues/423)) ([23efce9](https://github.com/snapotter-hq/snapotter/commit/23efce9df0f8cedabd9aab033b896f7f3dffc768))
* **api:** batch user-files delete to eliminate N+1 queries ([e2c5714](https://github.com/snapotter-hq/snapotter/commit/e2c57144dd1f8f9a7de629228967725861cb50c7))
* **api:** decode RAW via LibRaw first so DNG processes at full resolution ([#289](https://github.com/snapotter-hq/snapotter/issues/289)) ([#290](https://github.com/snapotter-hq/snapotter/issues/290)) ([3d9ff1e](https://github.com/snapotter-hq/snapotter/commit/3d9ff1e0d2c60a88fdba03c11f45e1422eacf84d))
* **api:** drop app-logger import from media-input; update stale errors mock ([c483897](https://github.com/snapotter-hq/snapotter/commit/c483897452d0769a3a1fbca8758fdc7eaf1b3cc0))
* **api:** fix batch user-files delete recursive CTE query ([82991b6](https://github.com/snapotter-hq/snapotter/commit/82991b6a412f84dd2d1d7295379da3cb189d1440))
* **api:** isolate the factory validation scratch dir from the worker's ([7a205ee](https://github.com/snapotter-hq/snapotter/commit/7a205eeb1239f6fa0d1e3c84c744325b9e953237))
* **api:** log only genuine processing faults at error level ([965501a](https://github.com/snapotter-hq/snapotter/commit/965501aef95fff1f5924e030434ea2688c4f0e8c))
* **api:** make OpenAPI spec ASCII-only so Schemathesis can load it ([#344](https://github.com/snapotter-hq/snapotter/issues/344)) ([c2ae334](https://github.com/snapotter-hq/snapotter/commit/c2ae334c81e18561931247db8f8e68ab08c1ef74))
* **api:** narrow friendlyError matching to avoid collapsing valid messages ([6220885](https://github.com/snapotter-hq/snapotter/commit/6220885e0cfd61b57186136aba174f0042dc6457))
* **api:** propagate lenient structural-validation flag to batch + pipeline ([e52e0bb](https://github.com/snapotter-hq/snapotter/commit/e52e0bb3d53bed90a58d0daca15c9aef633d7d02)), closes [#244](https://github.com/snapotter-hq/snapotter/issues/244)
* **api:** reject non-PDF inputs in pdf-to-image ([37b9c6d](https://github.com/snapotter-hq/snapotter/commit/37b9c6d7bf0d38ffc48febc324e96288b5f59fd4))
* **api:** respect RATE_LIMIT_PER_MIN for tool routes ([#272](https://github.com/snapotter-hq/snapotter/issues/272)) ([ce02ce1](https://github.com/snapotter-hq/snapotter/commit/ce02ce13486989d51314d2afabbdcaf8e0d2a9f9)), closes [#280](https://github.com/snapotter-hq/snapotter/issues/280)
* **api:** return user-safe processing errors, keep raw stderr in logs ([4af4bfa](https://github.com/snapotter-hq/snapotter/commit/4af4bfa8eba5ba059e804af33581ada7250a7d1c))
* **api:** section override for backwards-compat alias routes (adjust-colors) ([fc205c7](https://github.com/snapotter-hq/snapotter/commit/fc205c7428f3d27d542065a70c4a948e4e9742fd))
* **api:** stop leaking raw ffprobe stderr in media validation errors ([3fc4149](https://github.com/snapotter-hq/snapotter/commit/3fc41491437a2968b2ebfd79447d59e68da7ec1d))
* **api:** support sharp 0.35 types ([6f85b3d](https://github.com/snapotter-hq/snapotter/commit/6f85b3d12acac73caf747313511c49c7bdc6c257))
* **api:** wrap role rename and delete in transactions ([b564932](https://github.com/snapotter-hq/snapotter/commit/b5649320833ad0c5d6c57c887ef8587d74564dcb))
* apply processedFileName fallback everywhere processedFilename is used ([857aa75](https://github.com/snapotter-hq/snapotter/commit/857aa75562816dbcc0827eda93125605c495af7c))
* **audio:** low-samplerate ogg encode + post-2.0 QA hygiene ([19d9ed1](https://github.com/snapotter-hq/snapotter/commit/19d9ed181ae0051e0df6a01585036628dd31700a))
* **benchmark:** use section-prefixed tool URLs for 2.0 route scheme ([76fc695](https://github.com/snapotter-hq/snapotter/commit/76fc695233eae54c803ae1730cefb9acd161db45))
* build script venv handling and lint fixes ([b1e94bd](https://github.com/snapotter-hq/snapotter/commit/b1e94bd98851d3cc6da57b343ac8d2528dfda890))
* cache useSyncExternalStore snapshot to prevent infinite re-render ([f68fcb8](https://github.com/snapotter-hq/snapotter/commit/f68fcb8ca6724be0ca83a42593192608cde1a784))
* **ci:** address spec review findings in verify-bundle.sh ([4b5b351](https://github.com/snapotter-hq/snapotter/commit/4b5b35186d925f95566b7d36c9d3994255fc95e2))
* **ci:** deploy landing from dist, not the stale Next.js out path ([#240](https://github.com/snapotter-hq/snapotter/issues/240)) ([44bfca1](https://github.com/snapotter-hq/snapotter/commit/44bfca105fc4bfa1d5d2bfc0da861ed4e0a1e496))
* **ci:** grant ai-bundles reusable call its required token scopes ([03c1a5e](https://github.com/snapotter-hq/snapotter/commit/03c1a5e36f9dd7f904882b7cb19fc27006a61f5d))
* **ci:** harden smoke tests against set -e and fix parameter issues ([efac88c](https://github.com/snapotter-hq/snapotter/commit/efac88c20517c22b3a18a9cb227350cd10bdd3c1))
* **ci:** resolve pre-existing failures making main red ([#250](https://github.com/snapotter-hq/snapotter/issues/250)) ([622c9f9](https://github.com/snapotter-hq/snapotter/commit/622c9f98a5772eae05343407b8408cd7d7539ef9)), closes [#249](https://github.com/snapotter-hq/snapotter/issues/249) [246/#248](https://github.com/snapotter-hq/snapotter/issues/248)
* **ci:** revert rembg to 2.0.62 (2.0.75 requires numpy>=2.3) ([3b8d529](https://github.com/snapotter-hq/snapotter/commit/3b8d529b4422deb4d0782a5e4d536328563afd1e))
* clean file info cards for non-native video/media formats on tool page ([511e941](https://github.com/snapotter-hq/snapotter/commit/511e941da0516e27237621be1eeaf6beb64b2d89))
* clear file store when navigating between tools ([f32b3bd](https://github.com/snapotter-hq/snapotter/commit/f32b3bd51f2107040c081d0d9bee5ac5b0450157))
* correct SAML idpCert property name for @node-saml/node-saml v5 ([b9dac59](https://github.com/snapotter-hq/snapotter/commit/b9dac597362e2fbdd90447bfd7889f85dddfff90))
* critical first-login soft-lock in usage survey overlay ([#392](https://github.com/snapotter-hq/snapotter/issues/392)) ([ca076f9](https://github.com/snapotter-hq/snapotter/commit/ca076f91fde252fd98d3014a260d8ae7534481f0))
* **deps:** close js-yaml DoS alert + document rembg non-reachability ([#286](https://github.com/snapotter-hq/snapotter/issues/286)) ([5d5117a](https://github.com/snapotter-hq/snapotter/commit/5d5117acf729d3b2c00119eede9ba20f0aa17a28))
* **deps:** drop undici override (broke jsdom@29) ([5662532](https://github.com/snapotter-hq/snapotter/commit/56625325013b6c8ac47e159a4d517f7eef29a056))
* **deps:** patch Dependabot security alerts ([8792080](https://github.com/snapotter-hq/snapotter/commit/87920809820cb0179c029ccb7234370431abff67))
* **doc-engine:** treat qpdf exit code 3 (warnings) as success, not failure ([2a2151d](https://github.com/snapotter-hq/snapotter/commit/2a2151d7dd19faa1e4d43d49540729dab33a8eed))
* **docker:** copy patches/ before pnpm install so cold builds succeed ([#300](https://github.com/snapotter-hq/snapotter/issues/300)) ([f74f648](https://github.com/snapotter-hq/snapotter/commit/f74f648e47fb76a30b9fa34cd6dc84f4c0295972))
* **docker:** make storage writable under non-root/foreign UIDs (TrueNAS, OpenShift) ([#299](https://github.com/snapotter-hq/snapotter/issues/299)) ([1fec971](https://github.com/snapotter-hq/snapotter/commit/1fec97111bf4cf4620131e38651b8e114c7b0566)), closes [#230](https://github.com/snapotter-hq/snapotter/issues/230)
* **docker:** make venv bootstrap upgrade-aware with pip-freeze stamp ([39543d6](https://github.com/snapotter-hq/snapotter/commit/39543d651219d4741868ec7ebe34186aa038a914)), closes [#85](https://github.com/snapotter-hq/snapotter/issues/85)
* **docker:** patch OS + pip image CVEs, document accepted Trivy residuals ([#288](https://github.com/snapotter-hq/snapotter/issues/288)) ([c203267](https://github.com/snapotter-hq/snapotter/commit/c203267866aa87994de80d2214f70deff72b7b5f))
* **docker:** repair copied AI venv paths ([#390](https://github.com/snapotter-hq/snapotter/issues/390)) ([7e01d36](https://github.com/snapotter-hq/snapotter/commit/7e01d3637edec10c4b7c73cd6c9d54c6414972f6)), closes [#127](https://github.com/snapotter-hq/snapotter/issues/127) [#127](https://github.com/snapotter-hq/snapotter/issues/127)
* **docker:** restore Postgres/Redis in GPU compose stack + pause image publishing ([9b64a96](https://github.com/snapotter-hq/snapotter/commit/9b64a96bcd2e60ce8e3e051a9d2b57811e98a223))
* **e2e,landing:** robust path escaping (CodeQL) + unique file-tools card ([a6837b6](https://github.com/snapotter-hq/snapotter/commit/a6837b687a096b754367223b4472481071a450b7))
* **e2e:** disable Astro Dev Toolbar during landing e2e tests ([2927e0d](https://github.com/snapotter-hq/snapotter/commit/2927e0d4be063353abb9d23494158849ac3a191a))
* **e2e:** wait for post-login redirect before forcing navigation ([#341](https://github.com/snapotter-hq/snapotter/issues/341)) ([5b75d81](https://github.com/snapotter-hq/snapotter/commit/5b75d813b8523fd378c731de76c429fe900d9d28)), closes [#340](https://github.com/snapotter-hq/snapotter/issues/340)
* **editor:** apply layer effects + object flip, add Beta badge, repair e2e specs ([3120e67](https://github.com/snapotter-hq/snapotter/commit/3120e6708dd4e0eb39c2d3af01623e8f1e9c4473)), closes [#259](https://github.com/snapotter-hq/snapotter/issues/259)
* **editor:** capture document pixels without the zoom/pan transform ([#259](https://github.com/snapotter-hq/snapotter/issues/259)) ([81e16d7](https://github.com/snapotter-hq/snapotter/commit/81e16d7ce6648e3d7acace0b1915fd42774d1096)), closes [#258](https://github.com/snapotter-hq/snapotter/issues/258)
* **editor:** fill canvas viewport, fix black rulers, add resizable panel ([#258](https://github.com/snapotter-hq/snapotter/issues/258)) ([063a2e4](https://github.com/snapotter-hq/snapotter/commit/063a2e47e298e41d1115f4e6e92a96922a607ce6))
* enforce file type filtering using tool's acceptedInputs ([adfa532](https://github.com/snapotter-hq/snapotter/commit/adfa53246ae228eebe2fdd071f23a83400f1296c))
* **enterprise:** SCIM token generation, GDPR job cancellation, MFA replay, config redaction, encryption validation, SCIM rate limit ([29dd675](https://github.com/snapotter-hq/snapotter/commit/29dd675f4262ac0380df3113ae140b4fc7330d21))
* **enterprise:** ship enterprise package in prod image + S3, analytics, tracing, queue fixes ([#342](https://github.com/snapotter-hq/snapotter/issues/342)) ([8f4235d](https://github.com/snapotter-hq/snapotter/commit/8f4235d2c664337f3b970b1be5acc6f92474aeb6)), closes [#82](https://github.com/snapotter-hq/snapotter/issues/82)
* fetch settings on home page mount so tools are visible ([cf543f6](https://github.com/snapotter-hq/snapotter/commit/cf543f6976166b179deb1e5c0fa993bb9e037f0e))
* file library upload accepts all file types, not just images ([6bcee1e](https://github.com/snapotter-hq/snapotter/commit/6bcee1e0739daaad8c66abcc4a4e1bc00bb40735))
* **files:** record the source tool in toolChain on Save to Files ([#435](https://github.com/snapotter-hq/snapotter/issues/435)) ([47a60e7](https://github.com/snapotter-hq/snapotter/commit/47a60e7fad229a9bb9c8e4f33f152cacb3f3dfb4))
* first-run QA sweep of the single-container image ([#413](https://github.com/snapotter-hq/snapotter/issues/413)) ([bf417a5](https://github.com/snapotter-hq/snapotter/commit/bf417a509e529ee6b39d2d5a13a308172b4d08aa))
* GPU deployment robustness (6 fixes from end-to-end testing on an RTX 4070) ([#334](https://github.com/snapotter-hq/snapotter/issues/334)) ([35e18d8](https://github.com/snapotter-hq/snapotter/commit/35e18d8b79861b4aba46d4cb022be868d4d3e757))
* grey out incompatible files in library instead of hiding them ([3a5d55c](https://github.com/snapotter-hq/snapotter/commit/3a5d55cf268301df158163acbeaeaf50c6625a10))
* handle non-image modalities across uploads, previews, and filenames ([#255](https://github.com/snapotter-hq/snapotter/issues/255)) ([8eee17a](https://github.com/snapotter-hq/snapotter/commit/8eee17aeea41577a55b30ead97ca36224b387c04))
* harden against three production Sentry crashes ([#328](https://github.com/snapotter-hq/snapotter/issues/328)) ([8952e9b](https://github.com/snapotter-hq/snapotter/commit/8952e9ba475000da9d2d8e0959c63f3cf2b4506e))
* harden Docker image and async job responses ([f3342a1](https://github.com/snapotter-hq/snapotter/commit/f3342a1e571db5a12f5d8f659903ffe590fa2044))
* harden install queue/dispatcher lifecycle and repair review-sweep regressions ([#395](https://github.com/snapotter-hq/snapotter/issues/395)) ([b4375e5](https://github.com/snapotter-hq/snapotter/commit/b4375e558dfc5ccf34ee6736b886e90f662b1688)), closes [#388](https://github.com/snapotter-hq/snapotter/issues/388) [#390](https://github.com/snapotter-hq/snapotter/issues/390) [#391](https://github.com/snapotter-hq/snapotter/issues/391) [#392](https://github.com/snapotter-hq/snapotter/issues/392) [#393](https://github.com/snapotter-hq/snapotter/issues/393) [#394](https://github.com/snapotter-hq/snapotter/issues/394) [#392](https://github.com/snapotter-hq/snapotter/issues/392)
* **i18n:** complete and correct Italian translation ([#231](https://github.com/snapotter-hq/snapotter/issues/231)) ([#298](https://github.com/snapotter-hq/snapotter/issues/298)) ([c0a8b36](https://github.com/snapotter-hq/snapotter/commit/c0a8b36dcbf56f49fa2e58c8d040171e9e6b63e3))
* **i18n:** complete the Italian feedback translations ([#426](https://github.com/snapotter-hq/snapotter/issues/426)) ([3ae48cc](https://github.com/snapotter-hq/snapotter/commit/3ae48cc76ad4021854a805fcea486f58b045f595)), closes [#425](https://github.com/snapotter-hq/snapotter/issues/425)
* **i18n:** complete the Italian translation update ([#438](https://github.com/snapotter-hq/snapotter/issues/438)) ([#450](https://github.com/snapotter-hq/snapotter/issues/450)) ([0fafeb2](https://github.com/snapotter-hq/snapotter/commit/0fafeb26766ed49014d13b649f9b43ffc2fffca5))
* **i18n:** restore accents in Italian loading-message arrays ([#322](https://github.com/snapotter-hq/snapotter/issues/322)) ([29fcc87](https://github.com/snapotter-hq/snapotter/commit/29fcc8770887b981e73a17e43bea79a2f13da1e5)), closes [#298](https://github.com/snapotter-hq/snapotter/issues/298)
* **i18n:** translate Arabic (ar) UI strings ([#314](https://github.com/snapotter-hq/snapotter/issues/314)) ([ab37505](https://github.com/snapotter-hq/snapotter/commit/ab37505e681602d67ad447e3ad49588e905d48d9))
* **i18n:** translate Brazilian Portuguese (pt-BR) UI strings ([#307](https://github.com/snapotter-hq/snapotter/issues/307)) ([3900350](https://github.com/snapotter-hq/snapotter/commit/3900350ad56d63e9b8ed119539c94c54faf971e0))
* **i18n:** translate Dutch (nl) UI strings ([#309](https://github.com/snapotter-hq/snapotter/issues/309)) ([d036ff6](https://github.com/snapotter-hq/snapotter/commit/d036ff6d44fa9fd8025d3c38b382127066b248c3))
* **i18n:** translate French (fr) UI strings ([#306](https://github.com/snapotter-hq/snapotter/issues/306)) ([fe5c7c8](https://github.com/snapotter-hq/snapotter/commit/fe5c7c8c8667a24cebcd0af8b68f031ddc01ef15))
* **i18n:** translate German (de) UI strings ([#308](https://github.com/snapotter-hq/snapotter/issues/308)) ([4de24b8](https://github.com/snapotter-hq/snapotter/commit/4de24b8c9e4e703b4fd51965ccb9387e1e09fa59))
* **i18n:** translate Hindi (hi) UI strings ([#316](https://github.com/snapotter-hq/snapotter/issues/316)) ([00c89e4](https://github.com/snapotter-hq/snapotter/commit/00c89e4ae9060c1cc4100340f5db223bfd768e0f))
* **i18n:** translate Indonesian (id) UI strings ([#318](https://github.com/snapotter-hq/snapotter/issues/318)) ([8a8a4f9](https://github.com/snapotter-hq/snapotter/commit/8a8a4f99a431ec10ccfdbb472672e976b5b86db2))
* **i18n:** translate Japanese (ja) UI strings ([#304](https://github.com/snapotter-hq/snapotter/issues/304)) ([d8b037c](https://github.com/snapotter-hq/snapotter/commit/d8b037c8c6e8c6cde9c4c6900c1d5689143f5d5d))
* **i18n:** translate Korean (ko) UI strings ([#305](https://github.com/snapotter-hq/snapotter/issues/305)) ([e7b412f](https://github.com/snapotter-hq/snapotter/commit/e7b412fc097d6c745037781e7478414a33d6db25))
* **i18n:** translate Polish (pl) UI strings ([#312](https://github.com/snapotter-hq/snapotter/issues/312)) ([7ce9c64](https://github.com/snapotter-hq/snapotter/commit/7ce9c64b50c5b1fa1eb153c8635384eb5ae0e03b))
* **i18n:** translate Russian (ru) UI strings ([#311](https://github.com/snapotter-hq/snapotter/issues/311)) ([eb9a14a](https://github.com/snapotter-hq/snapotter/commit/eb9a14a226824047cdf00ac94ef647e2bfdcf23a))
* **i18n:** translate Simplified Chinese (zh-CN) UI strings ([#302](https://github.com/snapotter-hq/snapotter/issues/302)) ([26d8a06](https://github.com/snapotter-hq/snapotter/commit/26d8a0685c6b2a216fd72b9431d18543abfa89ee))
* **i18n:** translate Spanish (es) UI strings ([#301](https://github.com/snapotter-hq/snapotter/issues/301)) ([b3ff8ac](https://github.com/snapotter-hq/snapotter/commit/b3ff8accec5494d2fe97a27355257b3c5fa2f91d))
* **i18n:** translate Swedish (sv) UI strings ([#310](https://github.com/snapotter-hq/snapotter/issues/310)) ([c4ce5f9](https://github.com/snapotter-hq/snapotter/commit/c4ce5f96dfe6daf8e560de34cd748b1795ed12ff))
* **i18n:** translate Thai (th) UI strings ([#319](https://github.com/snapotter-hq/snapotter/issues/319)) ([5a6368d](https://github.com/snapotter-hq/snapotter/commit/5a6368db89df5419885b3f8dc568eeaa16cd8206))
* **i18n:** translate Traditional Chinese (zh-TW) UI strings ([#303](https://github.com/snapotter-hq/snapotter/issues/303)) ([de4d2ed](https://github.com/snapotter-hq/snapotter/commit/de4d2ed166d858530dcbbb0634ddcb9c7536ab07))
* **i18n:** translate Turkish (tr) UI strings ([#315](https://github.com/snapotter-hq/snapotter/issues/315)) ([8c1c2c3](https://github.com/snapotter-hq/snapotter/commit/8c1c2c310eac95d5a75fcfd563b9026dba9a4fae))
* **i18n:** translate Ukrainian (uk) UI strings ([#313](https://github.com/snapotter-hq/snapotter/issues/313)) ([6ee1b0f](https://github.com/snapotter-hq/snapotter/commit/6ee1b0f7a1b58dd7ae113fc4268067e0ac1e0b3c))
* **i18n:** translate Vietnamese (vi) UI strings ([#317](https://github.com/snapotter-hq/snapotter/issues/317)) ([4702721](https://github.com/snapotter-hq/snapotter/commit/470272169d947e27ff826e2c0e24e1553eda0543))
* **image-engine:** support sharp 0.35 types ([2137be4](https://github.com/snapotter-hq/snapotter/commit/2137be479e1a23e163587acd1609e77058e9e134))
* **jobs:** pre-warm QueueEvents to kill first-sync-wait flake ([#285](https://github.com/snapotter-hq/snapotter/issues/285)) ([dba8a85](https://github.com/snapotter-hq/snapotter/commit/dba8a85a8013231945741a8fabd09ed86db0d963))
* **jobs:** strip internal paths from all worker SSE error frames ([fc718c1](https://github.com/snapotter-hq/snapotter/commit/fc718c168487de1213c978797c3fc84288f26513))
* **landing:** add www redirect, noindex JS chunks, and website badge ([47b6984](https://github.com/snapotter-hq/snapotter/commit/47b6984be0c8d8de07e0770a34d61a9795b71eaf))
* **lint:** biome-format tool-factory and json-xml to green apps/api lint ([#252](https://github.com/snapotter-hq/snapotter/issues/252)) ([7865339](https://github.com/snapotter-hq/snapotter/commit/7865339fc8c3b8696af5919212ddba4120c07f23)), closes [#251](https://github.com/snapotter-hq/snapotter/issues/251)
* **lint:** clear remaining biome errors (unused code, optional chains, non-null assertions, effect deps) ([19dc6ba](https://github.com/snapotter-hq/snapotter/commit/19dc6ba554a05f531db01f23ce3e71297f651f81))
* **lint:** make husky hook executable; rename backend useS3 to isS3Enabled (clears 17 false-positive useHookAtTopLevel) ([7561f2a](https://github.com/snapotter-hq/snapotter/commit/7561f2a8c3a92c412f0d38b9f1323aa8bcfcf4a4))
* **lint:** resolve [#280](https://github.com/snapotter-hq/snapotter/issues/280) Lint failures (route formatting + landing import sort) ([6e1b9cd](https://github.com/snapotter-hq/snapotter/commit/6e1b9cd3cc3b33b18724eb071f3ad4023ab1ee80))
* make search bar full-width to align with tabs and grid ([207c1c3](https://github.com/snapotter-hq/snapotter/commit/207c1c348be5af23c793a96bf07b9f7b7c26ce31))
* **media:** encode gif-to-video WebM as yuv420p ([e96c314](https://github.com/snapotter-hq/snapotter/commit/e96c314ab9b049c3b01d49ff2622d2a351962cd9))
* **migrator:** correct and harden the 1.x to 2.0 SQLite import ([#434](https://github.com/snapotter-hq/snapotter/issues/434)) ([dadf766](https://github.com/snapotter-hq/snapotter/commit/dadf76689933faa8208de9730525409e2497518f))
* **nightly:** de-flake matrix timeouts, exclude browser tool from fuzz ([#349](https://github.com/snapotter-hq/snapotter/issues/349)) ([bbad953](https://github.com/snapotter-hq/snapotter/commit/bbad953e79a132007490c17dab2b774c4b8ae697)), closes [#347](https://github.com/snapotter-hq/snapotter/issues/347)
* **nightly:** qpdf in test image, NUL-byte settings, AI sub-path fuzz exclude ([#348](https://github.com/snapotter-hq/snapotter/issues/348)) ([078743d](https://github.com/snapotter-hq/snapotter/commit/078743d6b28aa4078f213cae4c39a3b99e515d8d)), closes [#346](https://github.com/snapotter-hq/snapotter/issues/346) [#346](https://github.com/snapotter-hq/snapotter/issues/346)
* **normalize-audio:** preserve source sample rate after loudnorm ([#248](https://github.com/snapotter-hq/snapotter/issues/248)) ([1548d47](https://github.com/snapotter-hq/snapotter/commit/1548d475ca3d1ace0f14d24ecc5e9a13ca5770a2))
* offline CodeFormer face-enhance (ship RealESRGAN_x2plus in upscale-enhance bundle) ([#433](https://github.com/snapotter-hq/snapotter/issues/433)) ([cf884b5](https://github.com/snapotter-hq/snapotter/commit/cf884b52cdf4e8852e0cd24215b22ed2220230da))
* **passport-photo:** require the face-detection bundle, not just background-removal ([#329](https://github.com/snapotter-hq/snapotter/issues/329)) ([32c1192](https://github.com/snapotter-hq/snapotter/commit/32c1192d635898012af2ff14cdbd68c0acd6a3e1)), closes [#327](https://github.com/snapotter-hq/snapotter/issues/327) [#327](https://github.com/snapotter-hq/snapotter/issues/327)
* PDF tool QA sweep - library auto-save versioning, AI fileId threading, modality polish ([#251](https://github.com/snapotter-hq/snapotter/issues/251)) ([08961fc](https://github.com/snapotter-hq/snapotter/commit/08961fcc8941bada2608e386bfa6d6b12e996f35))
* post-2.0 audit bug fixes (404 route, worker logging, outpaint gate, pandoc path) ([2bd3e23](https://github.com/snapotter-hq/snapotter/commit/2bd3e2302ad11b306971d0f651f8ad1ee1e9b785))
* prevent double scrollbar by locking html/body overflow ([914ff1b](https://github.com/snapotter-hq/snapotter/commit/914ff1b1aab345237f325cd152bd3ebc693bab52))
* preview generation works for processed results too ([b93dc95](https://github.com/snapotter-hq/snapotter/commit/b93dc95bcaa197cfd4b29c030a04decaa7babcf8))
* QA sweep - tool routes, security, i18n, a11y, + AI bundle install hardening ([#393](https://github.com/snapotter-hq/snapotter/issues/393)) ([b37faed](https://github.com/snapotter-hq/snapotter/commit/b37faed95fc3d2f51c78f40954fdbb5c7b94779d)), closes [hi#resolution](https://github.com/hi/issues/resolution) [hi#severity](https://github.com/hi/issues/severity)
* reassign 4 tools to correct display modes ([619f61b](https://github.com/snapotter-hq/snapotter/commit/619f61b4700c9fd3b21f90b7c9512672fae57dab))
* release-acceptance QA follow-ups (upload crash, scipy ABI conflict, rate limit, OCR fallback) ([#458](https://github.com/snapotter-hq/snapotter/issues/458)) ([60d01ab](https://github.com/snapotter-hq/snapotter/commit/60d01ab2ddfad4bf837d30369c2f39e9734cb571)), closes [#413](https://github.com/snapotter-hq/snapotter/issues/413) [#437](https://github.com/snapotter-hq/snapotter/issues/437)
* remove all legacy redirects from routes ([fd26fa3](https://github.com/snapotter-hq/snapotter/commit/fd26fa35868b75ca7fd352115396ec9b23dd4280))
* remove automatic third-party egress of user data + optional strict offline mode (OSM tiles, Scalar fonts, editor fonts, AI model downloads) ([#422](https://github.com/snapotter-hq/snapotter/issues/422)) ([6e3a14e](https://github.com/snapotter-hq/snapotter/commit/6e3a14ec6bfc15f18aef3c7aa20cde6d4823dc29))
* remove double scrollbar on home page ([ae95976](https://github.com/snapotter-hq/snapotter/commit/ae959760e3fec115021e2ada7af579ecd13f181c))
* remove duplicated 1.x migration callout in README ([#456](https://github.com/snapotter-hq/snapotter/issues/456)) ([2a899ef](https://github.com/snapotter-hq/snapotter/commit/2a899ef9041c3c637380a91e532273a3581a19d1)), closes [#448](https://github.com/snapotter-hq/snapotter/issues/448) [#454](https://github.com/snapotter-hq/snapotter/issues/454)
* remove redundant Getting Started section from home page ([287f6f1](https://github.com/snapotter-hq/snapotter/commit/287f6f15ded4b84e9d0f019522915ccac822d083))
* repair docker validation QA tooling, dispatcher crash-accounting, and image-enhancement RAW hang ([#391](https://github.com/snapotter-hq/snapotter/issues/391)) ([bd1838e](https://github.com/snapotter-hq/snapotter/commit/bd1838e40b0d11715eaf9eff6b4152a707a29b5b))
* repair URL import (DNS-pinned fetch on Node 22 + non-image modalities) ([#246](https://github.com/snapotter-hq/snapotter/issues/246)) ([8f6312c](https://github.com/snapotter-hq/snapotter/commit/8f6312c521246215ef1a27c65475aa2005e409e0))
* resolve 18 QA-discovered bugs across tools, previews, and the AI pipeline ([#242](https://github.com/snapotter-hq/snapotter/issues/242)) ([d8cf979](https://github.com/snapotter-hq/snapotter/commit/d8cf979d4ba31b802c254f7eeb5ef50b424a56b7))
* resolve 6 bugs from enterprise audit (SIEM cursor, legal hold join, SCIM role, GDPR self-purge, export OOM, quota check) ([7f62b1b](https://github.com/snapotter-hq/snapotter/commit/7f62b1bf12d2cf1baaf5586b201458eab100a111))
* resolve hardcoded /app paths and loosen mediapipe pin for native installs ([60e3ac2](https://github.com/snapotter-hq/snapotter/commit/60e3ac2210f93a350729246cf2b4bb303ab2ebc7)), closes [community-scripts/ProxmoxVE#14720](https://github.com/community-scripts/ProxmoxVE/issues/14720)
* resolve Sharp 0.35.1 and BullMQ type incompatibilities after dep bumps ([b76dc68](https://github.com/snapotter-hq/snapotter/commit/b76dc68682c664d4c6a22cf921e786d4c010b757))
* Save to Files shows green success state with checkmark after saving ([f4061fe](https://github.com/snapotter-hq/snapotter/commit/f4061fe4b0417ba896de138a791cfc869d3b33f3))
* **security:** basename-sanitize file-preview paths (CodeQL js/path-injection) ([7a3b4e6](https://github.com/snapotter-hq/snapotter/commit/7a3b4e6b3bbdee7c382bd4ad739485b37bb45f46))
* **security:** close file-preview path-injection + tighten subtitle detection ([c1cd871](https://github.com/snapotter-hq/snapotter/commit/c1cd8712f45d9defd5321f2d683cf207ee9d3740))
* **security:** close remaining high-severity CodeQL alerts ([bdadb84](https://github.com/snapotter-hq/snapotter/commit/bdadb843d8238d738e9f849f1754765f5de82411)), closes [hi#severity](https://github.com/hi/issues/severity)
* **security:** explicit per-route rate limits (CodeQL js/missing-rate-limiting) ([ae4fc1d](https://github.com/snapotter-hq/snapotter/commit/ae4fc1decf006b15a2f747cde07d4c1e35c5de13))
* **security:** harden auth and outbound fetches ([c6319cf](https://github.com/snapotter-hq/snapotter/commit/c6319cf8a9efe8745a29339613002c22f82e5393))
* **security:** harden rate limits, Redis auth, resource caps, and error sanitization ([d612264](https://github.com/snapotter-hq/snapotter/commit/d61226496b5745ff7f57ee8138009d4f81826095))
* **security:** numeric CIDR matching for IPv6 SSRF allow/deny ([f75cc32](https://github.com/snapotter-hq/snapotter/commit/f75cc328acd18b4714291400ac348058db6d28d8))
* send auth token with preview generation request ([6090688](https://github.com/snapotter-hq/snapotter/commit/609068870842629e085a77d9d5144c5102beae19))
* set a writable HOME for the app user so PaddleOCR works in non-root deployments ([#430](https://github.com/snapotter-hq/snapotter/issues/430)) ([e0dbf2a](https://github.com/snapotter-hq/snapotter/commit/e0dbf2a5c3cc9622218d31698452697957936e00))
* settings dialog and settings API correctness bugs ([8e9452e](https://github.com/snapotter-hq/snapotter/commit/8e9452e65073c500098fde040ce021e3b1c39639))
* show all tools on All tab, remove Popular and Browse sections ([b166f47](https://github.com/snapotter-hq/snapotter/commit/b166f47de515739d87a14ae408a351f81dd37c00))
* show image viewer for video-to-gif/webp results instead of broken video player ([90acd5b](https://github.com/snapotter-hq/snapotter/commit/90acd5bcd905f461f28a5b511c619d896d4a6724))
* show modality starting points in landing command center ([#387](https://github.com/snapotter-hq/snapotter/issues/387)) ([852f6ce](https://github.com/snapotter-hq/snapotter/commit/852f6cecba106eb9d000f95fc1ae9863157a5d3b))
* show tool-specific accepted formats in dropzone, remove privacy note ([5241ccd](https://github.com/snapotter-hq/snapotter/commit/5241ccd1247bda2d9e634576354f3b14a4077c63))
* sort enterprise exports for Biome lint compliance ([3b7f44e](https://github.com/snapotter-hq/snapotter/commit/3b7f44e50e450bff62560b9f21cb12330b0b2b82))
* stamp SnapOtter as Producer on generated PDFs ([#416](https://github.com/snapotter-hq/snapotter/issues/416)) ([8b3f1e6](https://github.com/snapotter-hq/snapotter/commit/8b3f1e6884361ef080c0165059bd8fdb4a14fd79))
* sync demo theme with app ([f6f7b5a](https://github.com/snapotter-hq/snapotter/commit/f6f7b5a4bc2867f680441a91a9af9e1bd148edf4))
* test server registration gaps, Redis subscriber cleanup, atomic settings upsert ([954cfb0](https://github.com/snapotter-hq/snapotter/commit/954cfb01a657ec49293a4e10e72e23eb69e4d9b2))
* **test:** align analytics-env test with ANALYTICS_ENABLED=true default ([96764ec](https://github.com/snapotter-hq/snapotter/commit/96764ec375189ebec396d0397b116407bfd75e05))
* **test:** mock db/index.js in unit tests that import API modules ([5b3b3c7](https://github.com/snapotter-hq/snapotter/commit/5b3b3c76329d62636c886dfa798b9e14acd7cc90))
* **test:** repair integration suite after analytics column/endpoint removal ([#340](https://github.com/snapotter-hq/snapotter/issues/340)) ([6917a8b](https://github.com/snapotter-hq/snapotter/commit/6917a8b0c7864fc9b244ecda23dcdbcbf02f9733)), closes [#336](https://github.com/snapotter-hq/snapotter/issues/336)
* **test:** resolve CI failures from the overhaul ([34b006d](https://github.com/snapotter-hq/snapotter/commit/34b006ded772b96d7b4336e5ffcc67e1039253c3))
* **tests:** section-prefix tool API URLs across overhauled suite ([d4dc2ea](https://github.com/snapotter-hq/snapotter/commit/d4dc2eae5db66b098d8a4e735ab61053ddb50635)), closes [#280](https://github.com/snapotter-hq/snapotter/issues/280)
* **test:** update import paths for cleanup.test.ts after move to integration ([78679c5](https://github.com/snapotter-hq/snapotter/commit/78679c57f46d11d89dcb384373a63e28e1a75635))
* **tools:** honest content-type for edit-metadata pass-through ([#350](https://github.com/snapotter-hq/snapotter/issues/350)) ([88af8d4](https://github.com/snapotter-hq/snapotter/commit/88af8d46fb001dd019de54e48dd7c73c5feaea73))
* **tools:** surface chars count in pdf-to-text result payload ([3c44335](https://github.com/snapotter-hq/snapotter/commit/3c4433583b836e53ee2a35b79c8d9be07760992e))
* top nav respects dark mode theme ([43b1901](https://github.com/snapotter-hq/snapotter/commit/43b190134e8858301fa3bffd1882260d6928c441))
* **ui:** constrain preview dropzone height in pipeline builder ([931e15a](https://github.com/snapotter-hq/snapotter/commit/931e15a6bd04fc84d236b41dbbd7df0feefe29a9))
* **ui:** show repair UI when AI bundle models are broken ([#214](https://github.com/snapotter-hq/snapotter/issues/214)) ([edea82b](https://github.com/snapotter-hq/snapotter/commit/edea82ba27cd92aa5188144e525f9889b6ba1b9d))
* update privacy policy to reference PostgreSQL instead of SQLite ([5af1ac4](https://github.com/snapotter-hq/snapotter/commit/5af1ac4dcf0c8ff17bdcc0efc6c179afc8543168))
* use media-player for all video/audio tools that had no-comparison or side-by-side ([69300b5](https://github.com/snapotter-hq/snapotter/commit/69300b5c83f43ebde213473f66d9f255e33cf9dc))
* use processedFileName fallback for non-native format detection after processing ([14ded6f](https://github.com/snapotter-hq/snapotter/commit/14ded6fbd0babb43de8a544527bb2293b9d83b2d))
* validate non-image inputs by modality (batch + pipeline) ([#244](https://github.com/snapotter-hq/snapotter/issues/244)) ([03e7123](https://github.com/snapotter-hq/snapotter/commit/03e71236f93853e28d7ad8428fe8a9b918849773))
* **web:** add modality to fuse search keys, merge docs+files in fullscreen grid ([3114323](https://github.com/snapotter-hq/snapotter/commit/3114323d07a941cfcb261bc245250a8f3f6e8222))
* **web:** point tool keyboard shortcuts at section routes ([0689ae5](https://github.com/snapotter-hq/snapotter/commit/0689ae554fa353a231f01e4dffd3ac362afcb3ba))
* **web:** resolve feature install status sync and mutual exclusivity ([#214](https://github.com/snapotter-hq/snapotter/issues/214)) ([492da82](https://github.com/snapotter-hq/snapotter/commit/492da820f8ce298addd3038dad2f55e91cdb12bd))
* **web:** restore preview panel rendering for all file types ([1181b1f](https://github.com/snapotter-hq/snapotter/commit/1181b1fe22c7f5a998f8954f9e02a184a3513cf8))
* **web:** show modality thumbnails for non-image files in the strip ([#245](https://github.com/snapotter-hq/snapotter/issues/245)) ([aa3ae6e](https://github.com/snapotter-hq/snapotter/commit/aa3ae6ec915821d664cef0c1537e2b64d9a6fcee))
* **web:** update dropzone to accept all file types, not just images ([b8b6b0a](https://github.com/snapotter-hq/snapotter/commit/b8b6b0a44ada1670e4e41bcf6cd22f713d14c512))
* **web:** wrap modality tabs to prevent overflow in narrow sidebar ([dab31d6](https://github.com/snapotter-hq/snapotter/commit/dab31d6e32c7eee95199d7a686d507a98d58138f))


### Features

* add a Keep it free sponsor button to the top nav ([#427](https://github.com/snapotter-hq/snapotter/issues/427)) ([7b04317](https://github.com/snapotter-hq/snapotter/commit/7b04317ed20e062c273fe60a19cdcaac2b50e651))
* add AES-256-GCM encryption at rest for sensitive settings ([2520cdd](https://github.com/snapotter-hq/snapotter/commit/2520cdd556c8a5946b4eb6426aebc8811944e8d9))
* add audio waveform visualization with wavesurfer.js ([d8a8e05](https://github.com/snapotter-hq/snapotter/commit/d8a8e055906eeab9d1f9a048c4f8d5517cff8f80))
* add backup status tracking endpoints ([2aea351](https://github.com/snapotter-hq/snapotter/commit/2aea351f70cfd171befad164bc553e7feb998884))
* add bundle build script for CI ([52b9405](https://github.com/snapotter-hq/snapotter/commit/52b940585afa1788119dc50f6d44e98f32192ad3))
* add CI workflow for building and publishing AI bundles ([7dabfe2](https://github.com/snapotter-hq/snapotter/commit/7dabfe293dd171bb7b7ec6909ced85b178e67961))
* add Cmd+Enter (process) and Cmd+S (download) keyboard shortcuts ([7c9ca85](https://github.com/snapotter-hq/snapotter/commit/7c9ca85952bc155580becc8f95125482875a3ed5))
* add enterprise Phase 1-4 feature flags and new permissions ([86d6f50](https://github.com/snapotter-hq/snapotter/commit/86d6f50ea6696032bed8f24ba0fd58fe54af5887))
* add full-width dropzone state and tool branding to tool page ([f2ac057](https://github.com/snapotter-hq/snapotter/commit/f2ac05747e1f3ffde4f2e3b3bf321237ef699e85))
* add GET /api/v1/tools/popular endpoint ([1107005](https://github.com/snapotter-hq/snapotter/commit/110700520cfaf4c70e54ff11e7cdee7f7cf50f66))
* add landing tool command center ([#386](https://github.com/snapotter-hq/snapotter/issues/386)) ([3b1d484](https://github.com/snapotter-hq/snapotter/commit/3b1d484b4d4cc9e9da843ceeb442c6dbf7c8066c))
* add OpenTelemetry distributed tracing (enterprise) ([#232](https://github.com/snapotter-hq/snapotter/issues/232)) ([3fb8164](https://github.com/snapotter-hq/snapotter/commit/3fb8164fa539ef952fddcef89bcec01097db991e))
* add page-level drop overlay and paste handler on tool page ([6ea515c](https://github.com/snapotter-hq/snapotter/commit/6ea515ccdd7cd35f3727d0cf4137b81e9bdea050))
* add per-tool permission model with category and per-tool modes ([9fa23f4](https://github.com/snapotter-hq/snapotter/commit/9fa23f454322808d8c791b9d26b6bdbd1a5e9e73))
* add per-user rate limiting and concurrent job limits ([239f85f](https://github.com/snapotter-hq/snapotter/commit/239f85f098c5c6d3576531e915f57f6128bec357))
* add PostHog customer feedback ([649e65b](https://github.com/snapotter-hq/snapotter/commit/649e65b035c6efbfbe32e4b1db040aa0f9f6ac81))
* add recent tools tracking via localStorage ([6c61ae4](https://github.com/snapotter-hq/snapotter/commit/6c61ae47f496b1aaf937228fe7c55058b0b0756f))
* add request correlation IDs to audit logs and response headers ([1cf1f47](https://github.com/snapotter-hq/snapotter/commit/1cf1f47d6f0554853a501ae1220dbdc0678820cb))
* add session idle timeout and concurrent session limit ([3cc4ef6](https://github.com/snapotter-hq/snapotter/commit/3cc4ef6895ddfc904252e4e99c48d5df41b4c17e))
* add settings slide-in, review panel with size delta, start-over preserving settings ([45121c1](https://github.com/snapotter-hq/snapotter/commit/45121c1a1e8f8f4ab8cbf9601c50faf4a2237803))
* add Sign PDF tool (draw/type/upload signatures, place on a PDF) ([#370](https://github.com/snapotter-hq/snapotter/issues/370)) ([0cdd560](https://github.com/snapotter-hq/snapotter/commit/0cdd560ac46827f7e103e9f1921aec58d226a7db))
* add storage usage tracking with DB counters and reconciliation ([aaa8a37](https://github.com/snapotter-hq/snapotter/commit/aaa8a37c9b3b490a8455311be89a0bd4b858a897))
* add team-level storage quotas with enforcement on upload and save ([d064286](https://github.com/snapotter-hq/snapotter/commit/d0642865590a56769adbc2d7bc6741a12800af52))
* add TopNav and AvatarDropdown components ([f79958a](https://github.com/snapotter-hq/snapotter/commit/f79958a6229015ad64149dadc1fe27909f314a57))
* add usage onboarding survey overlay ([#388](https://github.com/snapotter-hq/snapotter/issues/388)) ([a0d1c70](https://github.com/snapotter-hq/snapotter/commit/a0d1c70172f24af0d4656b6256fc1bfcb9256e69))
* add webhook delivery module with retry and backoff ([ab88b9a](https://github.com/snapotter-hq/snapotter/commit/ab88b9ad0d9104ae69862309f9d2b35c0251d6bc))
* **ai:** add a Reset AI Environment admin feature for the upgrade gap ([#459](https://github.com/snapotter-hq/snapotter/issues/459)) ([fb96cf8](https://github.com/snapotter-hq/snapotter/commit/fb96cf874364b331f152d414b69f8831d0004d07))
* All tab groups tools by modality with collapsible sections ([e7126f9](https://github.com/snapotter-hq/snapotter/commit/e7126f92931e1c0277aca6c56ef06276d961ef64))
* all-in-one embedded single-container mode ([#377](https://github.com/snapotter-hq/snapotter/issues/377)) ([084a9c9](https://github.com/snapotter-hq/snapotter/commit/084a9c9faa48a0b090b1d74be97297a3d5d6f727))
* **analytics:** build-time bake + telemetry depth ([#336](https://github.com/snapotter-hq/snapotter/issues/336)) ([5d36ac0](https://github.com/snapotter-hq/snapotter/commit/5d36ac06d88fc4ca3dbf48294c132249921207d9))
* **analytics:** inject Sentry DSN + PostHog key from build env ([#367](https://github.com/snapotter-hq/snapotter/issues/367)) ([9819c58](https://github.com/snapotter-hq/snapotter/commit/9819c5885eab3ea9857dc3b4ca4465fb4b0994f9)), closes [#336](https://github.com/snapotter-hq/snapotter/issues/336)
* **analytics:** upload web source maps to Sentry + tie release to build ([#369](https://github.com/snapotter-hq/snapotter/issues/369)) ([1c202c6](https://github.com/snapotter-hq/snapotter/commit/1c202c6ef08943f05d31fd4d83dff817e1c1503b))
* **api:** section-prefix all custom tool route literals ([10bb73f](https://github.com/snapotter-hq/snapotter/commit/10bb73ffc116814f4dc6ba9c33ed32d8d32d912d))
* **api:** section-prefix factory + batch routes via apiToolPath (+section validation) ([68dd7da](https://github.com/snapotter-hq/snapotter/commit/68dd7dabaa7a9e6d87017b257b5c8cb0f34ae90e))
* arrow key navigation in Files list ([52693fc](https://github.com/snapotter-hq/snapotter/commit/52693fc843143b9ac2d788fb9b5321ee3a52409f))
* **audit:** add TOOL_EXECUTED logging with opt-in setting ([36f083b](https://github.com/snapotter-hq/snapotter/commit/36f083ba64bfa2063c724223c3d59ffadb626cb5))
* **audit:** capture IP address, make TRUST_PROXY configurable ([5d2f520](https://github.com/snapotter-hq/snapotter/commit/5d2f520d7823969578945acfd3e6799bfd6ff3f7))
* **audit:** extensible event type system with shared constants ([37b2b9c](https://github.com/snapotter-hq/snapotter/commit/37b2b9c2eef0e2926dbee03f6b24f16eb53f544e))
* **automate:** make the pipeline builder fully multi-modal ([#335](https://github.com/snapotter-hq/snapotter/issues/335)) ([a53038e](https://github.com/snapotter-hq/snapotter/commit/a53038ed9610a964090a98f6973a25449a1e4a9f))
* bump feature manifest to v2 with archive metadata ([a4ac7cf](https://github.com/snapotter-hq/snapotter/commit/a4ac7cf7d66240f64fc7c394711a4ab5b5036056))
* **ci:** add verify job to ai-bundles workflow ([7d09927](https://github.com/snapotter-hq/snapotter/commit/7d099274c120c28845ab40fa8b00754015552901))
* **ci:** add verify-bundle.sh for AI bundle smoke testing ([5ee948d](https://github.com/snapotter-hq/snapotter/commit/5ee948d36a998f8a39b92d31cc9e3def331535e8))
* clean preview button with progress bar, add document preview support ([3decfaa](https://github.com/snapotter-hq/snapotter/commit/3decfaae3ea0180415851cacfc88674b50418c01))
* clean tool page nav, add Import from Files on dropzone ([b5eef64](https://github.com/snapotter-hq/snapotter/commit/b5eef644e3c932b18884141055b65a7904d57665))
* copy-primary for data tools, download-all label for multi-output, batch failure display ([bc3ad2b](https://github.com/snapotter-hq/snapotter/commit/bc3ad2b008e789b92597688923690f28d5cf54ed))
* **db:** add audit integrity/requestId columns, user_preferences table, audit indexes ([cafd2d8](https://github.com/snapotter-hq/snapotter/commit/cafd2d8b6547eccdb9735acf344207534c13aeae))
* **db:** add data lifecycle columns (deleteAfter, legalHold, quotas, retention) ([7e5843c](https://github.com/snapotter-hq/snapotter/commit/7e5843cd403b2d59d844d5a1d8d3a9ccb0618899))
* **db:** add identity columns (lastActivity, toolPermissions, TOTP) ([7ed043e](https://github.com/snapotter-hq/snapotter/commit/7ed043ec5301106ad64ec0accc7ce411d818a469))
* disable auto-save, add Save to Files button, accept all file types in library ([d0795b6](https://github.com/snapotter-hq/snapotter/commit/d0795b69eaecf61cdb65377ee5561fca64c1de26))
* **docs:** Two-Doors home, otter-orange brand, Pagefind search, and enterprise SSO/SCIM/roles guides ([91ac583](https://github.com/snapotter-hq/snapotter/commit/91ac583e873d70fed01ecdb337c60a0234ebdc1d))
* **enterprise:** add audit log archival with crash-safe state machine ([c1dc27f](https://github.com/snapotter-hq/snapotter/commit/c1dc27f2484120f7f4571c8472fccd292e43f259))
* **enterprise:** add audit log export endpoint (CSV/JSON) ([913dd6b](https://github.com/snapotter-hq/snapotter/commit/913dd6bbe1518e7b709dd002329417789e103f49))
* **enterprise:** add configuration export/import with dry-run and dependency validation ([0f883fe](https://github.com/snapotter-hq/snapotter/commit/0f883fe853fb818275bcdb44248f99e24ca33083))
* **enterprise:** add GDPR user data export (async) ([b6a8226](https://github.com/snapotter-hq/snapotter/commit/b6a82268377bc331e38e65dcf80fe60aec6a2ff2))
* **enterprise:** add GDPR user/team data purge with audit redaction ([dd2a507](https://github.com/snapotter-hq/snapotter/commit/dd2a50799a255a05e732de5943a7481b91b2c86d))
* **enterprise:** add IP allowlisting with CIDR matching and Redis cache ([db6f7bf](https://github.com/snapotter-hq/snapotter/commit/db6f7bf38af677f896a69ea75c2cd68ec05bffb7))
* **enterprise:** add legal hold with cleanup bypass ([fa7da7c](https://github.com/snapotter-hq/snapotter/commit/fa7da7ce0c3bf480a59b429c1ad39ab23fe7cf18))
* **enterprise:** add per-team retention overrides with deleteAfter ([b60f550](https://github.com/snapotter-hq/snapotter/commit/b60f550b3fa54c4b10681e6281e989678b6c955a))
* **enterprise:** add SAML 2.0 SSO with SP-initiated login ([54132d1](https://github.com/snapotter-hq/snapotter/commit/54132d1833439425825954c4c55fba7975e24d0a))
* **enterprise:** add SCIM 2.0 provisioning (Users + Groups) ([a1b5c6d](https://github.com/snapotter-hq/snapotter/commit/a1b5c6d2c30c8a195a17b534a18c5fb93733135a))
* **enterprise:** add SIEM webhook forwarding with circuit breaker ([d3f30a2](https://github.com/snapotter-hq/snapotter/commit/d3f30a2f5d1d846bb4d56a3d2f0c208065258ba8))
* **enterprise:** add SSO enforcement mode with break-glass admin ([0c4468a](https://github.com/snapotter-hq/snapotter/commit/0c4468a004c228e860912dd8e3e662d270d3d113))
* **enterprise:** add tamper-resistant audit mode with HMAC integrity ([895e29e](https://github.com/snapotter-hq/snapotter/commit/895e29e93fb141a279dcd090ad0199f248faed2f))
* **enterprise:** add TOTP MFA with enrollment, verification, and recovery codes ([1787be3](https://github.com/snapotter-hq/snapotter/commit/1787be35fe4b6d3b1f313511cc36c2277df64034))
* **enterprise:** add unified webhook system with admin alerts ([d86e458](https://github.com/snapotter-hq/snapotter/commit/d86e4585e4e1069fa95aa49de951827fbdccf8f3))
* **enterprise:** add upgrade management endpoints (version, migrations, readiness) ([03e12e6](https://github.com/snapotter-hq/snapotter/commit/03e12e6f0b92308dc311a33a848cf09cd7e74bfd))
* expand alternatives comparisons ([#384](https://github.com/snapotter-hq/snapotter/issues/384)) ([174001d](https://github.com/snapotter-hq/snapotter/commit/174001d3844172fbc8d7dad8282ef1d83a8e4d7f))
* expand Prometheus metrics with request duration, storage, and auth counters ([fb14f41](https://github.com/snapotter-hq/snapotter/commit/fb14f41512e8d65417b6a7dee129d48f05285459))
* extend crash recovery for pre-built bundle artifacts ([d1e9536](https://github.com/snapotter-hq/snapotter/commit/d1e9536cffb7a53a291627bd36d173d850082a41))
* extend health endpoints with disk space, S3, storage, and backup checks ([6237684](https://github.com/snapotter-hq/snapotter/commit/6237684ec86289fdfab5ed982dd2af6a9a5e37d1))
* extend importBundleArchive for site-packages and fixups ([5d5240e](https://github.com/snapotter-hq/snapotter/commit/5d5240e48131653e3a64917fae312a044326992c))
* **feedback:** always-on nav button with GitHub/email handoff when analytics is off ([#428](https://github.com/snapotter-hq/snapotter/issues/428)) ([5dcc06a](https://github.com/snapotter-hq/snapotter/commit/5dcc06a99ea18a6b5448b3a7a1e54b40158c8b07))
* **feedback:** route failed-run Report issue through the offline handoff ([#429](https://github.com/snapotter-hq/snapotter/issues/429)) ([8cdd85a](https://github.com/snapotter-hq/snapotter/commit/8cdd85a49339c2cce3c916b756e4c6da1fe2abfc))
* filter files by modality when importing from tool page ([826f1ef](https://github.com/snapotter-hq/snapotter/commit/826f1efc087d1708ee1171b145f710e57a9d7ed2))
* **i18n:** add repair UI strings for broken AI bundles ([8e15fe7](https://github.com/snapotter-hq/snapotter/commit/8e15fe7a3f633771ba05e1b4cb2f3eae15b5bed0))
* **i18n:** raise translation coverage across all 20 locales ([#332](https://github.com/snapotter-hq/snapotter/issues/332)) ([ffbf4f9](https://github.com/snapotter-hq/snapotter/commit/ffbf4f9e10f5e8f4fde9be286e0e7a024dde7a15))
* **i18n:** raise translation coverage across all 20 locales (round 2) ([#453](https://github.com/snapotter-hq/snapotter/issues/453)) ([44e1f90](https://github.com/snapotter-hq/snapotter/commit/44e1f90e4a847b7059869cd5750280f472ef3a05)), closes [#428](https://github.com/snapotter-hq/snapotter/issues/428) [425/#426](https://github.com/snapotter-hq/snapotter/issues/426)
* Import from Files works, remove pipeline button from files page ([b8a6b20](https://github.com/snapotter-hq/snapotter/commit/b8a6b2018ed1736ab4f9f234b435bce666c10d90))
* inline error messages with recovery actions ([56cd843](https://github.com/snapotter-hq/snapotter/commit/56cd843482ab93d59f26fc360fa48d11f161c815))
* **landing,docs:** SEO fixes and query-matched tool pages ([#383](https://github.com/snapotter-hq/snapotter/issues/383)) ([ec98dfd](https://github.com/snapotter-hq/snapotter/commit/ec98dfde9a63590f513c1448a18a57f836ad1515))
* **landing:** add animated shadergradient hero background ([#411](https://github.com/snapotter-hq/snapotter/issues/411)) ([5500fac](https://github.com/snapotter-hq/snapotter/commit/5500facc5d8d38437bd976663a10b41ba71bee10))
* **landing:** auto-refresh live GitHub stars and image-pull stats ([#292](https://github.com/snapotter-hq/snapotter/issues/292)) ([33671d2](https://github.com/snapotter-hq/snapotter/commit/33671d2d9227ffbb3580e8b7d40fd260c06d7853))
* **landing:** enterprise-focused hero redesign and section polish ([#239](https://github.com/snapotter-hq/snapotter/issues/239)) ([f622a4f](https://github.com/snapotter-hq/snapotter/commit/f622a4f691dce066adcc31bd8838b1f4014b92e0))
* **landing:** generate 301 redirects for old tool URLs; fix robots sitemap reference ([0051655](https://github.com/snapotter-hq/snapotter/commit/0051655bbf0201642f97436adf5c3130af8131c0))
* **landing:** migrate from Next.js to Astro 5 ([8403222](https://github.com/snapotter-hq/snapotter/commit/8403222d08034362382a902feec509665cb32bcb))
* **landing:** one-command Docker quickstart + live-demo CTA in hero ([#455](https://github.com/snapotter-hq/snapotter/issues/455)) ([aaf39a1](https://github.com/snapotter-hq/snapotter/commit/aaf39a1b7221e6581b681e776513063aed39eed3))
* **landing:** refocus hero on privacy-sensitive teams ([#431](https://github.com/snapotter-hq/snapotter/issues/431)) ([8451f9b](https://github.com/snapotter-hq/snapotter/commit/8451f9be0883dc58ac4413bc00c6e6edd082a896))
* **landing:** section-nested tool routes, section index pages, and section-prefixed links ([f158be6](https://github.com/snapotter-hq/snapotter/commit/f158be6aaa1e4ce907e0abe93a20f6791168b310))
* **landing:** swap Try Demo for Get Started Free CTA in top nav ([#418](https://github.com/snapotter-hq/snapotter/issues/418)) ([ea004a3](https://github.com/snapotter-hq/snapotter/commit/ea004a3308de489efa45fa77585ec4da9da82180))
* **landing:** warm up the contact CTAs ([#412](https://github.com/snapotter-hq/snapotter/issues/412)) ([3d4a84d](https://github.com/snapotter-hq/snapotter/commit/3d4a84d06865f0d790d39fee50809633cc6892c8))
* make password policy configurable via admin settings ([8b349b0](https://github.com/snapotter-hq/snapotter/commit/8b349b0341b8cde518558c8ef83523263a95abae))
* merge PostHog customer feedback ([1d99acf](https://github.com/snapotter-hq/snapotter/commit/1d99acf9ee30e0fe9528b02761a3eed5e808f0b8))
* mobile layout for tool-first flow ([896acda](https://github.com/snapotter-hq/snapotter/commit/896acda7ed033a13817d3556c50cea35ec884c3c))
* modality-aware file preview in Files library ([a70b13a](https://github.com/snapotter-hq/snapotter/commit/a70b13ad3207617c794fd90bf5c5dcd85c4a90ec))
* modality-based URLs (/image/resize, /video/compress-video) ([ea83e1c](https://github.com/snapotter-hq/snapotter/commit/ea83e1c8b4af7e613b4a5184b7b3e816ba1f1376))
* **modality:** rename "file" modality label "Data" -> "Files" ([71fefc0](https://github.com/snapotter-hq/snapotter/commit/71fefc05b08bdfc344de6beb16963b7cc632fac2))
* move theme toggle and language selector to top nav bar ([aff9159](https://github.com/snapotter-hq/snapotter/commit/aff9159ae0ef251a5be46bbae5a8a20ede2c419a))
* on-demand preview generation with progress messages for non-native formats ([d3cd4e4](https://github.com/snapotter-hq/snapotter/commit/d3cd4e41b5c8fab1732c16243c0a6c5c46b0b63e))
* pin frequently-used tools to the top of the dashboard ([#440](https://github.com/snapotter-hq/snapotter/issues/440)) ([3aaaacc](https://github.com/snapotter-hq/snapotter/commit/3aaaacc7a1830d748a3f6602cc6a81efbc9a9f32))
* pipeline templates, analytics opt-out, 83 conversion presets, positioning + e2e modernization ([63a03d2](https://github.com/snapotter-hq/snapotter/commit/63a03d26f2f627578420dc4b7011e1078635651a)), closes [#355](https://github.com/snapotter-hq/snapotter/issues/355) [#354](https://github.com/snapotter-hq/snapotter/issues/354) [#356](https://github.com/snapotter-hq/snapotter/issues/356) [#353](https://github.com/snapotter-hq/snapotter/issues/353) [#351](https://github.com/snapotter-hq/snapotter/issues/351)
* polish home page UI -- card borders, colored icons, 3-col grid, Cmd+K hint ([ade79c5](https://github.com/snapotter-hq/snapotter/commit/ade79c53a59cd3a991224f5e82b9a6e3861457bf))
* redesign review panel action hierarchy ([ed458d4](https://github.com/snapotter-hq/snapotter/commit/ed458d4bbdfaeb7054fa15c1fbaf2616ed19f45f))
* remove /fullscreen route, add dynamic page titles ([f9ebb30](https://github.com/snapotter-hq/snapotter/commit/f9ebb304db1b71ad0e6149d094dd7f6cac8777db))
* replace sidebar with top nav bar across all pages ([71fef43](https://github.com/snapotter-hq/snapotter/commit/71fef439a0d41bce34890d637c40a670fb2ce443))
* request a tool when home search finds nothing ([#385](https://github.com/snapotter-hq/snapotter/issues/385)) ([c68297d](https://github.com/snapotter-hq/snapotter/commit/c68297d5a49e659645b510da245241aa26a40cb6))
* rewrite home page as tool-first browser with search and modality tabs ([0d751b7](https://github.com/snapotter-hq/snapotter/commit/0d751b7d143a9102b3fe24e94c4e49ce616ee310))
* rewrite install_feature.py for pre-built tar bundles ([a4fa3ce](https://github.com/snapotter-hq/snapotter/commit/a4fa3ce2a71930a8b57fd3f17181c51f703a2081))
* **scripts:** add segment-anchored tool-path rewrite transform ([c17a4a4](https://github.com/snapotter-hq/snapotter/commit/c17a4a422582594c6e2127429a7373c2e0ade11c))
* **scripts:** add tool-path codemod CLI ([0691457](https://github.com/snapotter-hq/snapotter/commit/0691457f94dd63a53285107ab56d9ba73c1b3b47))
* server-side preview generation for non-native video/audio formats ([412a21e](https://github.com/snapotter-hq/snapotter/commit/412a21ee4d9a68baadef817509a5cc1a675a5143))
* **shared:** add apiToolPath() and section-prefixed routes; drop MODALITY_URL_SLUG ([9ca901f](https://github.com/snapotter-hq/snapotter/commit/9ca901f8d5b23b0a03060b3384af58c60cfbbaa0))
* **shared:** add Section concept and toolSection() partition ([7907471](https://github.com/snapotter-hq/snapotter/commit/790747188afe4fa0347579d6ce2db80d68bcfd2b))
* tiered processing feedback and upload progress indicator ([433d59c](https://github.com/snapotter-hq/snapotter/commit/433d59c726d196c7b51ea2cc29b0e2d44fa11feb))
* tool-first workflow polish -- fix tests, lint cleanup ([f387e98](https://github.com/snapotter-hq/snapotter/commit/f387e98fff6049a4869cebd4e4d7a717e7c1f28e))
* **tools:** 2.0 phase 5 wave 2 - pdf depth (21 tools) ([#220](https://github.com/snapotter-hq/snapotter/issues/220)) ([2f39e38](https://github.com/snapotter-hq/snapotter/commit/2f39e3816209fe81fac4620dd1233921e5de90d4))
* **tools:** 2.0 phase 5 wave 3a - video depth (22 tools) ([#221](https://github.com/snapotter-hq/snapotter/issues/221)) ([5f98b48](https://github.com/snapotter-hq/snapotter/commit/5f98b485935f07e40c0a6e57548892b2e17fc03b))
* **tools:** 2.0 phase 5 wave 3b - audio depth (14 tools) ([#222](https://github.com/snapotter-hq/snapotter/issues/222)) ([638288e](https://github.com/snapotter-hq/snapotter/commit/638288e196f05d889b5d818c0c8a11b0697ec49c))
* **tools:** 2.0 phase 5 wave 4 - office, ebooks, data, archives (14 tools) ([#224](https://github.com/snapotter-hq/snapotter/issues/224)) ([fc7c1f8](https://github.com/snapotter-hq/snapotter/commit/fc7c1f850e36fd01db9f08caf574f6f48d606b93))
* **tools:** 2.0 phase 5 wave 5a - image gap-fill (11 tools) ([#225](https://github.com/snapotter-hq/snapotter/issues/225)) ([6e1b986](https://github.com/snapotter-hq/snapotter/commit/6e1b9865f10c50badddb693a09ec20557379fe63))
* **tools:** 2.0 phase 5 wave 5b - ai pool: ocr-pdf, transcription, background composites (5 tools) ([#226](https://github.com/snapotter-hq/snapotter/issues/226)) ([51666cd](https://github.com/snapotter-hq/snapotter/commit/51666cdd5fd207ceee4da38b63d998af9a044809))
* **web:** add data retention settings to admin UI ([3016571](https://github.com/snapotter-hq/snapotter/commit/3016571c2b2925e8fc7677d9d2daae2bd8191db1))
* **web:** add MFA login prompt and security settings UI ([d397f57](https://github.com/snapotter-hq/snapotter/commit/d397f576676d127ee23c49a2948b041a6a6a777e))
* **web:** add storage dashboard and team retention settings ([c7e9b1d](https://github.com/snapotter-hq/snapotter/commit/c7e9b1ddc6189f847633399a982ce88cb6ae4a85))
* **web:** apply Otter Orange design system and UI improvements ([bcd59c2](https://github.com/snapotter-hq/snapotter/commit/bcd59c20c7da6208e937cac0a9b9f02ecf73b4f1)), closes [#E07832](https://github.com/snapotter-hq/snapotter/issues/E07832) [#2563eb](https://github.com/snapotter-hq/snapotter/issues/2563eb)
* **web:** complete audit log viewer with IP column and all event types ([c6f9a29](https://github.com/snapotter-hq/snapotter/commit/c6f9a29687562c929d708a110eb0b7145c4dab11))
* **web:** fuzzy search with fuse.js for typo-tolerant tool discovery ([22cccd4](https://github.com/snapotter-hq/snapotter/commit/22cccd46c44c386aed5303efbd608105ddc1b30f))
* **web:** group home grid, tabs, and breadcrumb by section ([8301676](https://github.com/snapotter-hq/snapotter/commit/8301676e139fa0ed1d2423e133b11e0214bfe4cd))
* **web:** icon-only modality tabs, merge documents and files ([cc06c80](https://github.com/snapotter-hq/snapotter/commit/cc06c802c13b4d229fa2a97c3493aef4a555b1e6))
* **web:** in-canvas zoom & pan for the object eraser and split tools ([#320](https://github.com/snapotter-hq/snapotter/issues/320)) ([95d100c](https://github.com/snapotter-hq/snapotter/commit/95d100c20bd9b41cca3190a7791807516d2a17e4))
* **web:** modality filter tabs in sidebar tool panel ([8adceaf](https://github.com/snapotter-hq/snapotter/commit/8adceaf92d3effd8b4a2f15d6f8ecfc0f6c1ab8d))
* **web:** modality tabs on fullscreen grid page ([82fb798](https://github.com/snapotter-hq/snapotter/commit/82fb798142663b22d23bda69bf66d0d8cb56def9))
* **web:** section-prefix all tool API calls ([22b4b5c](https://github.com/snapotter-hq/snapotter/commit/22b4b5c3c17ea28712e2e9bf06ca35b6c5a23bd3))
* **web:** show icon + text labels on modality filter tabs ([888d243](https://github.com/snapotter-hq/snapotter/commit/888d243a653b7ecfab20830be2ea8baa961f8e71))
* **web:** stronger modality section visual hierarchy in tool catalog ([3db1b3b](https://github.com/snapotter-hq/snapotter/commit/3db1b3bafd9bfcde86c9d74037a30114437e4f71))
* wire AI bundle build into release pipeline ([d0732d4](https://github.com/snapotter-hq/snapotter/commit/d0732d4a586be25231be93e51e94db7ae05ae8ca))


### Reverts

* **deps:** keep rembg at 2.0.69 (2.0.75 conflicts with pinned numpy==1.26.4) ([4fdd10f](https://github.com/snapotter-hq/snapotter/commit/4fdd10f488642eabe671aa111796d343d0e2d358))


### BREAKING CHANGES

* SnapOtter 2.0 - the platform re-architecture (Postgres 17 +
Redis 8 + BullMQ durable jobs, 157 tools across five modalities) is the 2.0
release line, replacing the 1.x SQLite single-container architecture.
* SQLite is no longer the runtime database. Deployments now
require Postgres (and Redis, used from phase 2). Existing installs migrate
with SQLITE_MIGRATE_PATH or 'pnpm --filter @snapotter/api migrate:sqlite'.

* fix(ci): postgres service + fresh e2e database per run; ignore unfixable torch CVE-2025-3000

## [1.15.8](https://github.com/snapotter-hq/snapotter/compare/v1.15.7...v1.15.8) (2026-04-17)


### Bug Fixes

* copy Node.js from official image instead of apt-get install ([536125e](https://github.com/snapotter-hq/snapotter/commit/536125ec9fbc5758bdd3e8f0f4c44253de2231c7))

## [1.15.7](https://github.com/snapotter-hq/snapotter/compare/v1.15.6...v1.15.7) (2026-04-17)


### Bug Fixes

* add retry with backoff for apt-get update on CUDA base image ([3d6db5a](https://github.com/snapotter-hq/snapotter/commit/3d6db5a32d3f9292d5476e9bd80c1f06624fa316))

## [1.15.6](https://github.com/snapotter-hq/snapotter/compare/v1.15.5...v1.15.6) (2026-04-17)


### Performance Improvements

* parallelize model downloads and switch to registry cache ([79c4ed6](https://github.com/snapotter-hq/snapotter/commit/79c4ed6a359b008dedeb154a55e2764ee0e3d9fa))

## [1.15.5](https://github.com/snapotter-hq/snapotter/compare/v1.15.4...v1.15.5) (2026-04-17)


### Bug Fixes

* exclude e2e-docker tests from Vitest runner ([8df18c5](https://github.com/snapotter-hq/snapotter/commit/8df18c56a6c69e2a188cf0e7c97e692cd4c0e7ec))

## [1.15.4](https://github.com/snapotter-hq/snapotter/compare/v1.15.3...v1.15.4) (2026-04-17)


### Bug Fixes

* verbose error handling, batch processing, and multi-file support ([3223960](https://github.com/snapotter-hq/snapotter/commit/32239600ae6ce30628e77e61a805ca0a167b5068))
* verbose errors, batch processing, multi-file support ([#1](https://github.com/snapotter-hq/snapotter/issues/1)) ([8b87cf8](https://github.com/snapotter-hq/snapotter/commit/8b87cf888c6194e2af427a180607d7c53a1d15b9))

## [1.15.3](https://github.com/snapotter-hq/snapotter/compare/v1.15.2...v1.15.3) (2026-04-16)


### Bug Fixes

* retry apt-get update on transient mirror sync errors (Acquire::Retries=3) ([cec7163](https://github.com/snapotter-hq/snapotter/commit/cec71632d0c868c3a413b813ff15baccc8fa8cdd))

## [1.15.2](https://github.com/snapotter-hq/snapotter/compare/v1.15.1...v1.15.2) (2026-04-16)


### Bug Fixes

* use GHCR_TOKEN with write:packages scope for GHCR login ([e14414f](https://github.com/snapotter-hq/snapotter/commit/e14414f3061981b1454dc7d4504c64ec01db945e))

## [1.15.1](https://github.com/snapotter-hq/snapotter/compare/v1.15.0...v1.15.1) (2026-04-16)


### Bug Fixes

* **docker:** create /opt/models unconditionally so chown works in CI ([93ce289](https://github.com/snapotter-hq/snapotter/commit/93ce2891cc26afc93f01168d008927d3d356c1a9))
* **docker:** run frontend builder on BUILDPLATFORM to fix esbuild crash under QEMU ([6a3ad0d](https://github.com/snapotter-hq/snapotter/commit/6a3ad0d496e291b30a3f719ca079c43ce7aab705))
* resolve runtime model path mismatch for non-root Docker user ([f28792a](https://github.com/snapotter-hq/snapotter/commit/f28792a5ed78221f38cf2f3c80cae9f24cd7f5e3))

# [1.14.0](https://github.com/snapotter-hq/snapotter/compare/v1.13.0...v1.14.0) (2026-04-10)


### Bug Fixes

* add FILES_STORAGE_PATH to Dockerfile ENV to prevent data loss ([b575243](https://github.com/snapotter-hq/snapotter/commit/b575243e9a0cb2ac4567d785a74e57dea912e9e2))
* add shutdown timeout and improve health endpoint ([986ad37](https://github.com/snapotter-hq/snapotter/commit/986ad37bb5e6644dd93521018a1bcd2d6243f502))
* address code review findings before merge ([caf65bc](https://github.com/snapotter-hq/snapotter/commit/caf65bc4697ddfea27674b56fd2e8de847edc734))
* correct PaddleOCR language codes for model download and OCR ([e1ee571](https://github.com/snapotter-hq/snapotter/commit/e1ee57103c201f104b737c2719d0014d4912d4b2))
* force CPU mode in download_models.py for build-time compatibility ([b4b59a7](https://github.com/snapotter-hq/snapotter/commit/b4b59a7500375bc2e65cb0050e5308b07610d2cf))
* handle paddlepaddle-gpu CUDA import at build time gracefully ([0083a74](https://github.com/snapotter-hq/snapotter/commit/0083a741a9a3924ccc37c4e622c2980a8a41f1a3))
* install cuda-compat stubs for build-time PaddlePaddle import ([d31d665](https://github.com/snapotter-hq/snapotter/commit/d31d66556ef0aa7c20a73a94f5d95b54b99fbb8a))
* load RealESRGAN pretrained weights for actual AI upscaling ([fa9569c](https://github.com/snapotter-hq/snapotter/commit/fa9569c920d6bdac094dcd661fc5cf3b4be3f17a))
* revert to npx tsx in CMD for pnpm compatibility ([e55253d](https://github.com/snapotter-hq/snapotter/commit/e55253dee03f9e93187d50e0ffb66b423a1230c0))
* simplify smoke test to CPU-only imports for build-time compat ([3481663](https://github.com/snapotter-hq/snapotter/commit/34816639609cbccab91a5cad5760fea769c4b565))
* skip RealESRGAN import check on arm64 in smoke test ([1e2ef52](https://github.com/snapotter-hq/snapotter/commit/1e2ef5284686253ae33e05411a515369b7f41a3e))
* split paddlepaddle-gpu and paddleocr installs, use --extra-index-url ([74183e8](https://github.com/snapotter-hq/snapotter/commit/74183e8dc1e3d8f90cff4484f5526c3c3dfba9a6))
* suppress ML library stdout noise in ocr.py and upscale.py ([c0b419d](https://github.com/snapotter-hq/snapotter/commit/c0b419de21acb92b243ef78191dff6a2153c5961))
* use PaddlePaddle GPU package index for CUDA wheels ([dd9528f](https://github.com/snapotter-hq/snapotter/commit/dd9528f53c9bcf148842ab94f14a4ebd5ae223ec))
* use platform-specific mediapipe version for arm64 compatibility ([7face19](https://github.com/snapotter-hq/snapotter/commit/7face19238f54cfea02d453b697e34b50ccd9d21))


### Features

* expand model pre-download with verification and smoke test ([a9e3b96](https://github.com/snapotter-hq/snapotter/commit/a9e3b9688776a51efd2f42cae810de425cf1d9cf))
* simplify CI to single unified Docker build ([b385a2e](https://github.com/snapotter-hq/snapotter/commit/b385a2eabb255f7a8fe2d3720a358ff5bf254310))
* simplify compose to single file, add log rotation ([84f7057](https://github.com/snapotter-hq/snapotter/commit/84f7057a49850b7a47440099ec2caad8d3b87efe))
* unified Docker image with GPU auto-detection ([6c3eb3b](https://github.com/snapotter-hq/snapotter/commit/6c3eb3b876cee0301d5fb3ed8324a3c8e92b1307))

# [1.13.0](https://github.com/snapotter-hq/snapotter/compare/v1.12.0...v1.13.0) (2026-04-10)


### Bug Fixes

* complete RBAC implementation lost during merge ([cc8a272](https://github.com/snapotter-hq/snapotter/commit/cc8a27239b02a63ca88abc3e363c8a46f89674e8))


### Features

* add backend permission map and requirePermission middleware ([1a99571](https://github.com/snapotter-hq/snapotter/commit/1a995711535a1525e709cdd7bff75361f457e942))
* add permission checks and admin override to API key routes ([d776680](https://github.com/snapotter-hq/snapotter/commit/d776680f2d2342e35b84821792d6c24ae7e0ffbc))
* add permission checks and admin override to pipeline routes ([59f40db](https://github.com/snapotter-hq/snapotter/commit/59f40dbfd4a97f8691b5fbbf6d338063c389987b))
* add permission checks and ownership scoping to user-files routes ([86ba698](https://github.com/snapotter-hq/snapotter/commit/86ba69825a1dd87c9f868d79cd806b7d594cce1b))
* add shared Permission and Role types ([2f594e9](https://github.com/snapotter-hq/snapotter/commit/2f594e96057c72bf107f3012426e87af5f97eb94))
* add tools:use permission check to tool, batch, pipeline, and upload routes ([885ace5](https://github.com/snapotter-hq/snapotter/commit/885ace54f09b3301989f8aa404c15f60e19c054d))
* extend useAuth hook with role and permissions from session ([e0ba8be](https://github.com/snapotter-hq/snapotter/commit/e0ba8be7b3211299c8cde90b2d22e7796eee2206))
* filter settings tabs by user permissions, remove admin fallback ([bcbd24a](https://github.com/snapotter-hq/snapotter/commit/bcbd24a2395b93b64dbbf638ba0138f9ec9ba9da))
* include permissions and teamName in login/session responses ([4943177](https://github.com/snapotter-hq/snapotter/commit/49431772ec6a02eae8aced48da92ef87a6c89afb))
* replace requireAdmin with requirePermission on all routes ([af7f57d](https://github.com/snapotter-hq/snapotter/commit/af7f57d52f49c8f8412876639076084c96eba284))

# [1.12.0](https://github.com/snapotter-hq/snapotter/compare/v1.11.0...v1.12.0) (2026-04-10)


### Bug Fixes

* **a11y:** add keyboard support to pdf-to-image upload dropzone ([1778f72](https://github.com/snapotter-hq/snapotter/commit/1778f7266b9837a07b20f167e82e1e9b163086b7))
* use specific selector in pdf-to-image e2e test ([b2a2c89](https://github.com/snapotter-hq/snapotter/commit/b2a2c890a1d25f60e392e6a2df23e1600cc3ad8d))


### Features

* add pdf-to-image backend route with info and processing endpoints ([30155c1](https://github.com/snapotter-hq/snapotter/commit/30155c1c7073c55290d4f662f7f93779cc4512b7))
* add pdf-to-image frontend settings component ([44bbfba](https://github.com/snapotter-hq/snapotter/commit/44bbfba80dfb3eb069c563e5ca691a0f8dce1eea))
* register pdf-to-image in frontend tool registry ([5fd294c](https://github.com/snapotter-hq/snapotter/commit/5fd294c994e7df076c4de0016f62d952a161345b))
* register pdf-to-image tool in shared constants and i18n ([43324c1](https://github.com/snapotter-hq/snapotter/commit/43324c1f23e3f278c89fa301d5a0275b12f587e7))
* unified Docker image with GPU auto-detection ([#37](https://github.com/snapotter-hq/snapotter/issues/37)) ([b0083e2](https://github.com/snapotter-hq/snapotter/commit/b0083e2b083d0bf52b6a576f7ef67fbff0cc8cbe))

# [1.12.0](https://github.com/snapotter-hq/snapotter/compare/v1.11.0...v1.12.0) (2026-04-10)


### Features

* unified Docker image with GPU auto-detection ([#37](https://github.com/snapotter-hq/snapotter/issues/37)) ([b0083e2](https://github.com/snapotter-hq/snapotter/commit/b0083e2b083d0bf52b6a576f7ef67fbff0cc8cbe))

# [1.11.0](https://github.com/snapotter-hq/snapotter/compare/v1.10.0...v1.11.0) (2026-04-07)


### Features

* **docs:** auto-generate llms.txt via vitepress-plugin-llms ([ee28ec6](https://github.com/snapotter-hq/snapotter/commit/ee28ec66ea137127bb1f4f1bf9e43be0b9f78cbf))

# [1.10.0](https://github.com/snapotter-hq/snapotter/compare/v1.9.0...v1.10.0) (2026-04-07)


### Features

* add content-aware resize API route and registration ([aa3cc5c](https://github.com/snapotter-hq/snapotter/commit/aa3cc5c6d0d602bcc88dac23684620676c4b3a3f))
* add content-aware resize toggle to resize settings UI ([4b4464f](https://github.com/snapotter-hq/snapotter/commit/4b4464f4a0b63ec312d961fecc22232b39e14872))
* add seam carving AI bridge module ([3c0f5b6](https://github.com/snapotter-hq/snapotter/commit/3c0f5b6c45bf0ba8b37d67aa0fa25d3c3603e888))
* add seam carving Python script with face protection ([fb833e4](https://github.com/snapotter-hq/snapotter/commit/fb833e4613ab8aa63b95facc2fe621eaa27e438a))

# [1.9.0](https://github.com/snapotter-hq/snapotter/compare/v1.8.1...v1.9.0) (2026-04-07)


### Features

* add stitch API route handler ([63ea0ba](https://github.com/snapotter-hq/snapotter/commit/63ea0ba5ef23ba3b1b296ae21358ce150f8f2bf2))
* add stitch settings UI component ([6abe893](https://github.com/snapotter-hq/snapotter/commit/6abe893c467b4b868383e15316132787d5831029))
* register stitch component in web tool registry ([612f7d9](https://github.com/snapotter-hq/snapotter/commit/612f7d90124e92ba324a59b5a6642290dc216cff))
* register stitch route in API tool registry ([a37d54f](https://github.com/snapotter-hq/snapotter/commit/a37d54f2c1e72b711901b87367b4d1c9ba2a5c5b))
* register stitch tool in shared constants and i18n ([b881416](https://github.com/snapotter-hq/snapotter/commit/b881416a164cc482a050adc93164fa1c88937a2f))

## [1.8.1](https://github.com/snapotter-hq/snapotter/compare/v1.8.0...v1.8.1) (2026-04-07)


### Bug Fixes

* add variant diagnostics to health endpoint and lite mode banner ([2c6e499](https://github.com/snapotter-hq/snapotter/commit/2c6e4996d5d711d1d20fb6105f55da48d6f04c62))

# [1.8.0](https://github.com/snapotter-hq/snapotter/compare/v1.7.7...v1.8.0) (2026-04-06)


### Bug Fixes

* filter unsafe round-trip keys server-side in editMetadata ([32bde85](https://github.com/snapotter-hq/snapotter/commit/32bde85956c4d99c7b8c255fc3166a79a72644ff))


### Features

* add edit-metadata API route with inspect and edit endpoints ([ff07b83](https://github.com/snapotter-hq/snapotter/commit/ff07b8301ce3db875307296d62a17037fa960360))
* add edit-metadata UI component with granular strip support ([dcd600d](https://github.com/snapotter-hq/snapotter/commit/dcd600d0f4a4ded2669d3471926d63288aaada84))
* add EditMetadataOptions type and exif-reader dep to image-engine ([39bc5bc](https://github.com/snapotter-hq/snapotter/commit/39bc5bc9eb02f21774fed1c0a4fbdd3d09623483))
* extract shared metadata parsing utilities into image-engine ([c075849](https://github.com/snapotter-hq/snapotter/commit/c07584993f99de2eaa455c9962e3ab3eaadd9613))
* implement editMetadata operation in image-engine ([f3be1ef](https://github.com/snapotter-hq/snapotter/commit/f3be1efd8b03bef84e9237fc3dac8bc6f70ff234))
* register edit-metadata in shared constants and i18n ([4a424d7](https://github.com/snapotter-hq/snapotter/commit/4a424d74b5a82aff26f09b67de3f3ab4c0f5555e))

## [1.7.7](https://github.com/snapotter-hq/snapotter/compare/v1.7.6...v1.7.7) (2026-04-06)


### Bug Fixes

* improve AI tool reliability for face detection and background removal ([#25](https://github.com/snapotter-hq/snapotter/issues/25)) ([1963a80](https://github.com/snapotter-hq/snapotter/commit/1963a8012c572fe86132e6847e313019165416da))

## [1.7.6](https://github.com/snapotter-hq/snapotter/compare/v1.7.5...v1.7.6) (2026-04-06)


### Bug Fixes

* batch SSE progress and non-AI processing UX ([#24](https://github.com/snapotter-hq/snapotter/issues/24)) ([0ce42d1](https://github.com/snapotter-hq/snapotter/commit/0ce42d1b2fa4f0b753a962a1f45a491e29ecee24))

## [1.7.5](https://github.com/snapotter-hq/snapotter/compare/v1.7.4...v1.7.5) (2026-04-06)


### Bug Fixes

* add server-side logging to AI tool routes ([#23](https://github.com/snapotter-hq/snapotter/issues/23)) ([3645de8](https://github.com/snapotter-hq/snapotter/commit/3645de89326644c5173cdfee58f6b762cb308609))

## [1.7.4](https://github.com/snapotter-hq/snapotter/compare/v1.7.3...v1.7.4) (2026-04-06)


### Bug Fixes

* batch file ordering and format preservation for image tools ([#20](https://github.com/snapotter-hq/snapotter/issues/20)) ([822a078](https://github.com/snapotter-hq/snapotter/commit/822a078882ba4ade851c68bc8fe115dc69cb2a81)), closes [#13](https://github.com/snapotter-hq/snapotter/issues/13) [#14](https://github.com/snapotter-hq/snapotter/issues/14)

## [1.7.3](https://github.com/snapotter-hq/snapotter/compare/v1.7.2...v1.7.3) (2026-04-06)


### Bug Fixes

* **docs:** correct broken llms.txt links on REST API page ([5e3a8b3](https://github.com/snapotter-hq/snapotter/commit/5e3a8b390c33812b7c4d0044b2a0ba3719d380ac))

## [1.7.2](https://github.com/snapotter-hq/snapotter/compare/v1.7.1...v1.7.2) (2026-04-05)


### Bug Fixes

* use torch.cuda for GPU detection instead of onnxruntime providers ([7185bd5](https://github.com/snapotter-hq/snapotter/commit/7185bd5ce373a42cd94e750765ee11d328fb34bb))

## [1.7.1](https://github.com/snapotter-hq/snapotter/compare/v1.7.0...v1.7.1) (2026-04-05)


### Bug Fixes

* prevent false GPU detection when CUDA image runs without GPU ([1efb163](https://github.com/snapotter-hq/snapotter/commit/1efb163acd0271f956fb777955f8701460230def))

# [1.7.0](https://github.com/snapotter-hq/snapotter/compare/v1.6.0...v1.7.0) (2026-04-05)


### Bug Fixes

* **web:** skip empty Authorization header for forward-auth proxy compatibility ([636153f](https://github.com/snapotter-hq/snapotter/commit/636153f8f131e683b2553df2732e967772e07017)), closes [#6](https://github.com/snapotter-hq/snapotter/issues/6)


### Features

* add GPU/CUDA acceleration support (:cuda Docker tag) ([a5f62f0](https://github.com/snapotter-hq/snapotter/commit/a5f62f0d1426092b6b0164cf1ae1159a392ebf44))

# [1.6.0](https://github.com/snapotter-hq/snapotter/compare/v1.5.3...v1.6.0) (2026-04-04)


### Features

* lightweight Docker image without AI/ML tools (:lite tag) ([3a0b988](https://github.com/snapotter-hq/snapotter/commit/3a0b988b746a5fbe6df10fe8ee288e30e42d747f)), closes [#1](https://github.com/snapotter-hq/snapotter/issues/1)

## [1.5.3](https://github.com/snapotter-hq/snapotter/compare/v1.5.2...v1.5.3) (2026-04-04)


### Bug Fixes

* use heif-convert for HEIC decoding on Linux ([da15a1e](https://github.com/snapotter-hq/snapotter/commit/da15a1e833c15c3d93a9da734d354b725b99b0bf))

## [1.5.2](https://github.com/snapotter-hq/snapotter/compare/v1.5.1...v1.5.2) (2026-04-04)


### Bug Fixes

* install HEVC codec plugins for CI HEIC tests ([24e7591](https://github.com/snapotter-hq/snapotter/commit/24e7591b9af777b739e7cc0db80839b776074b6f))

## [1.5.1](https://github.com/snapotter-hq/snapotter/compare/v1.5.0...v1.5.1) (2026-04-04)


### Bug Fixes

* install libheif-examples in CI for HEIC tests ([d06092c](https://github.com/snapotter-hq/snapotter/commit/d06092cba9db8cd91154196a11796a6dfc37bebb))

# [1.5.0](https://github.com/snapotter-hq/snapotter/compare/v1.4.0...v1.5.0) (2026-04-04)


### Features

* add HEIC/HEIF format support for input and output ([df1dc02](https://github.com/snapotter-hq/snapotter/commit/df1dc029857f0fa614f63c2bc835f9502be046fb))

# [1.4.0](https://github.com/snapotter-hq/snapotter/compare/v1.3.1...v1.4.0) (2026-04-04)


### Features

* add "Crop to Content" mode to smart crop tool ([df479d3](https://github.com/snapotter-hq/snapotter/commit/df479d3410a8b0d89c93f14ab6471c9dda2b0744)), closes [#7](https://github.com/snapotter-hq/snapotter/issues/7)

## [1.3.1](https://github.com/snapotter-hq/snapotter/compare/v1.3.0...v1.3.1) (2026-04-04)


### Bug Fixes

* default theme to light instead of following system preference ([018fcce](https://github.com/snapotter-hq/snapotter/commit/018fcce84cd2bf4c7b49f1eff9eda5bc078d19d3))

# [1.3.0](https://github.com/snapotter-hq/snapotter/compare/v1.2.1...v1.3.0) (2026-04-04)


### Bug Fixes

* add XHR timeout to prevent UI spinning forever ([0abacb2](https://github.com/snapotter-hq/snapotter/commit/0abacb211cc60f3c1e8dabccc24bc6ca46ce782a))
* disable worker pool to prevent Docker processing hang ([e36cd0c](https://github.com/snapotter-hq/snapotter/commit/e36cd0c24a34c5f716b5018e57f3d319fe5c5c44))
* log volume permission errors instead of swallowing them ([a3e6927](https://github.com/snapotter-hq/snapotter/commit/a3e6927df0f4fdd06f6c2aafbf6dbd1c52019cb2))
* replace crypto.randomUUID with generateId in AI tool settings ([ed91861](https://github.com/snapotter-hq/snapotter/commit/ed918615d2449bdda93d6ea12420454571edbf2d))
* replace crypto.randomUUID with generateId in pipeline/automation ([bcbf86c](https://github.com/snapotter-hq/snapotter/commit/bcbf86c04b76ecdbc2bfae5a67d5ac929ba2ae8e))
* replace crypto.randomUUID with generateId in use-tool-processor ([07cc2d0](https://github.com/snapotter-hq/snapotter/commit/07cc2d002e5964a1dee20d05021aa4b479c75f6e))
* replace navigator.clipboard with copyToClipboard utility ([1857aeb](https://github.com/snapotter-hq/snapotter/commit/1857aeb89407ecb878ae967594e6408150d20d37))
* resolve multiple API and e2e test bugs ([00deafb](https://github.com/snapotter-hq/snapotter/commit/00deafb2c8ad5cef14eb74207f3b2bd2bc3f13f2))
* restore navigator.clipboard and execCommand mocks in tests ([57e71b7](https://github.com/snapotter-hq/snapotter/commit/57e71b7c9a2c3d77bf6318df35bed7fe8c1d7e69))


### Features

* add copyToClipboard() utility with execCommand fallback ([8686131](https://github.com/snapotter-hq/snapotter/commit/868613188e010760e33c96df60d03930027535da))
* add generateId() utility for non-secure context compatibility ([ee7741b](https://github.com/snapotter-hq/snapotter/commit/ee7741b26765e95cf145400f4a39bfa06b9dfe9a))

## [1.2.1](https://github.com/snapotter-hq/snapotter/compare/v1.2.0...v1.2.1) (2026-04-03)


### Bug Fixes

* handle volume permission issues for bind-mounted /data directory ([863a51c](https://github.com/snapotter-hq/snapotter/commit/863a51c37d481f5f01b965f58e56eae0f7cd6538))

# [1.2.0](https://github.com/snapotter-hq/snapotter/compare/v1.1.0...v1.2.0) (2026-04-03)


### Features

* move theme toggle and GitHub button to top-right navbar ([0ba9fa5](https://github.com/snapotter-hq/snapotter/commit/0ba9fa5db7efa2557ed569d638c15256f9453364))

# [1.1.0](https://github.com/snapotter-hq/snapotter/compare/v1.0.1...v1.1.0) (2026-04-03)


### Features

* add GitHub stars button to docs navbar and fix footer license ([90030fc](https://github.com/snapotter-hq/snapotter/commit/90030fccafed8ad247063ef71dca3cdedaff3916))

## [1.0.1](https://github.com/snapotter-hq/snapotter/compare/v1.0.0...v1.0.1) (2026-03-30)


### Bug Fixes

* allow SVG files in the convert tool ([034281b](https://github.com/snapotter-hq/snapotter/commit/034281b1d4b19487ec0f900c3173465e0faf2510))

# 1.0.0 (2026-03-30)


### Bug Fixes

* **a11y:** add aria-hidden to decorative GemLogo SVG ([ae185ce](https://github.com/snapotter-hq/snapotter/commit/ae185ce767a480719d2f54d5675cbd7d64beb7b5))
* add remove-background settings to pipeline step configurator ([ae5ac81](https://github.com/snapotter-hq/snapotter/commit/ae5ac8134689e211f17534f3064995597b6337c8))
* add SSE progress endpoint to public paths ([18c3da0](https://github.com/snapotter-hq/snapotter/commit/18c3da0d41cba74c55fffd1a9f58c1a8ee5d5574))
* **api:** allow Scalar docs through auth and CSP ([6023109](https://github.com/snapotter-hq/snapotter/commit/6023109df9c66c1e7b4d81f3e902f081809ed6ba))
* **api:** resolve team name lookup and show server error messages ([609fc8b](https://github.com/snapotter-hq/snapotter/commit/609fc8b6cc2d2408226e2576c35d7715bdf1498c))
* **api:** use content instead of spec.content for Scalar v1.49 API ([dfcb4d5](https://github.com/snapotter-hq/snapotter/commit/dfcb4d579f4b44013d23dff8617d9a9f6315b452))
* apply continuous progress bar to erase-object and OCR ([196c553](https://github.com/snapotter-hq/snapotter/commit/196c553af57bb9efbd32282dd24fc080fb7228dd))
* **blur-faces:** switch from MediaPipe to OpenCV and auto-orient images ([dc10f90](https://github.com/snapotter-hq/snapotter/commit/dc10f905c62c662f1a40701c81874e5854ea33e6))
* bridge.ts ENOENT check for Python venv fallback ([92442cd](https://github.com/snapotter-hq/snapotter/commit/92442cd0fd354e9644d7957dd5035a9fc16d9b95))
* clear search when adding a step from the tool picker ([ae2e63f](https://github.com/snapotter-hq/snapotter/commit/ae2e63f7fc4af3556539eee577b253c0616cbd0f))
* continuous progress bar (no 100%→0% reset) ([b4abefe](https://github.com/snapotter-hq/snapotter/commit/b4abefe94776a1b9a9700f469e56de060c7626ca))
* **crop:** use percentCrop from onChange to fix inflated pixel values ([f238820](https://github.com/snapotter-hq/snapotter/commit/f2388206324e4ddc6114b91421ca8bcb634fc340))
* deduplicate react in Vite to prevent zustand hook errors in monorepo ([b3d6947](https://github.com/snapotter-hq/snapotter/commit/b3d6947d47f9b22b155e3a8c46667dd7671ac508))
* **docker:** add build layer caching for faster Docker rebuilds ([03ba30d](https://github.com/snapotter-hq/snapotter/commit/03ba30d8f01c5c2500641d934b08a875589bcd68))
* **docker:** skip husky prepare script in production install ([fdfb0a0](https://github.com/snapotter-hq/snapotter/commit/fdfb0a0e7412c86e3b85a70daf5093f44c34ee99))
* **docs:** clean up footer llms.txt links ([e842cde](https://github.com/snapotter-hq/snapotter/commit/e842cde838ad3deb1437c4c43c8ccd796276248c))
* **docs:** ignore localhost dead links in VitePress build ([78269d4](https://github.com/snapotter-hq/snapotter/commit/78269d499c914d5d68c4455475a1608f4af2a075))
* **docs:** remove hero logo from home page ([64c0ec8](https://github.com/snapotter-hq/snapotter/commit/64c0ec895f82b09e50d5ecf2b85f759f0a481232))
* handle migration race condition in concurrent test workers ([d576ab1](https://github.com/snapotter-hq/snapotter/commit/d576ab1dfb1e9d2aa739c681c1f83d6fef3f7d22))
* make port 1349 the UI port in all modes ([20a2637](https://github.com/snapotter-hq/snapotter/commit/20a26372d8be1c2c4fc10a821b1e000c663efb0c))
* move health diagnostics behind admin auth ([ee9a20f](https://github.com/snapotter-hq/snapotter/commit/ee9a20f6a35a0681b3688f0e206914fceed8fd8c))
* **ocr:** update PaddleOCR for v3 API and add Tesseract fallback ([e260a93](https://github.com/snapotter-hq/snapotter/commit/e260a93cf65f1e7cd22b7b5d491c6125fee8c915))
* pipeline only shows compatible tools and displays errors ([fe021c1](https://github.com/snapotter-hq/snapotter/commit/fe021c18b134c853262c8f0dac81c13f9ceeb435))
* prevent pipeline step settings from resetting on collapse ([d899ef1](https://github.com/snapotter-hq/snapotter/commit/d899ef128004e46200da785a960da50894e93861))
* prevent stale closure in pipeline step callbacks ([c67f002](https://github.com/snapotter-hq/snapotter/commit/c67f0027804f167e250bd497505399c07b539c4e))
* prevent useAuth infinite loop causing rate limit storms ([9624dae](https://github.com/snapotter-hq/snapotter/commit/9624dae1569b6f2ad52ce990fc84eca809b849a8))
* Python bridge fallback only on missing venv, not script errors ([79e4116](https://github.com/snapotter-hq/snapotter/commit/79e41160cb8bc1010ab87d1c396934e15e104086))
* reject HTML tags in settings API to prevent stored XSS ([d5bd011](https://github.com/snapotter-hq/snapotter/commit/d5bd01189766ee0797fe35ff3651f38f59a65881))
* remove explicit pnpm version from CI to avoid conflict with packageManager ([c0f5dad](https://github.com/snapotter-hq/snapotter/commit/c0f5dad93332bad09e5e771e1b52513186256b33))
* remove Google Drive coming soon placeholder from files nav ([e487fe0](https://github.com/snapotter-hq/snapotter/commit/e487fe06bf4cad6512100bf9660498e06c1047ba))
* resolve 3 critical UX bugs - home upload, auth, and form submit ([97267c7](https://github.com/snapotter-hq/snapotter/commit/97267c7b747e0d5861ca5272f553af4162e8cd9a))
* resolve pipeline step race condition and infinite re-render loop ([e0177d4](https://github.com/snapotter-hq/snapotter/commit/e0177d405ef043a64f0b3a885e98169312be1fac))
* resolve test failures from shared DB race conditions ([1a7116d](https://github.com/snapotter-hq/snapotter/commit/1a7116d79072d131b94d1c454abbc32b9e961c1b))
* resolve tsx not found in AI docs updater workflow ([dfbef8d](https://github.com/snapotter-hq/snapotter/commit/dfbef8d723dcc2960187db36676107f708707e33))
* resolve TypeScript Uint8Array type error with fflate ([c1b06b3](https://github.com/snapotter-hq/snapotter/commit/c1b06b37f2cf2aef6971f1b16b5691ce7d932b87))
* restore APP_VERSION import used by health endpoint ([2a74b60](https://github.com/snapotter-hq/snapotter/commit/2a74b604466193994bcc87ba2ef589f4c15d9547))
* setError(null) was overriding setProcessing(true) ([2be94b7](https://github.com/snapotter-hq/snapotter/commit/2be94b77b2b288086b55101e6854bf0407935b28))
* show checkerboard behind transparent images in before/after slider ([73741e6](https://github.com/snapotter-hq/snapotter/commit/73741e6efbdee53396810a2bb11eaf9597e4aa32))
* simplify public health to static response, add 403 test ([9c05da6](https://github.com/snapotter-hq/snapotter/commit/9c05da6f1372abd071e5249b102d86fa294e0d22))
* streamline CI/CD — remove broken AI docs updater, fix Docker publish ([ad2c96d](https://github.com/snapotter-hq/snapotter/commit/ad2c96d7b86b55b602e973f5da30d517605ed5cd))
* surface hidden errors and add batch rejection tests ([2f8e2ce](https://github.com/snapotter-hq/snapotter/commit/2f8e2ce7e2b96613ebda249890632bc54c11980b))
* switch README Docker references from GHCR to Docker Hub ([9e15679](https://github.com/snapotter-hq/snapotter/commit/9e1567971d50d755ef3b51d31e80b5a31a28ed2d))
* sync stepsRef during render, not useEffect ([0c86744](https://github.com/snapotter-hq/snapotter/commit/0c86744dda1073988c7e6bb55073f08e399c26f3))
* **test:** add missing PNG fixture files to repo ([45c6b9d](https://github.com/snapotter-hq/snapotter/commit/45c6b9de08124fb357ac759e43c4fbf1eb5fbfb9))
* **test:** exclude e2e tests from vitest and fix CI test suite ([9d28485](https://github.com/snapotter-hq/snapotter/commit/9d28485339e17b80586cea91bd18dafc989d7f24))
* **tests:** remove temp DB cleanup that races with other test files ([498bfb3](https://github.com/snapotter-hq/snapotter/commit/498bfb3def2d6786fa5e387b3e30ede9768ef616))
* trigger browser password save prompt on password change ([6b279ad](https://github.com/snapotter-hq/snapotter/commit/6b279ad09b9e74de34732b0e854f1180f25b34bd))
* **ui:** clean up settings, automate page, fullscreen logo, and README ([b3c8ad4](https://github.com/snapotter-hq/snapotter/commit/b3c8ad4697000454a11aaace27d0baa37a9959d9))
* unify project on port 1349, improve strip-metadata and UI components ([4912ee3](https://github.com/snapotter-hq/snapotter/commit/4912ee37e961b9ba9748d7ffa9164d7ca5ae0abb))
* **upscale:** auto-orient images before upscaling and improve UI ([8a6e665](https://github.com/snapotter-hq/snapotter/commit/8a6e665a4484bda1e4b93b520c393bb707a624aa))
* use BiRefNet-Lite as default model and fix JSON parsing ([c8159d3](https://github.com/snapotter-hq/snapotter/commit/c8159d3a9a0394f1bec3a66ffea6122a787a7ca7))
* use two-pass validation in settings PUT to prevent partial writes ([2dc39d3](https://github.com/snapotter-hq/snapotter/commit/2dc39d353320b73d9abb96ee5ae1080c2ee2f9cb))
* use U2-Net as default model (fast, 2s) with BiRefNet as opt-in ([7ebed9a](https://github.com/snapotter-hq/snapotter/commit/7ebed9a8d44f13d091fbc599be83b34a92049c5f))
* white screen crash when uploading photos with null GPS EXIF data ([c913df9](https://github.com/snapotter-hq/snapotter/commit/c913df9c0eccb0a1d0ff305cc6dcb1c99ddf96f4))


### Features

* accept clientJobId in batch endpoint for SSE progress correlation ([8ed57f4](https://github.com/snapotter-hq/snapotter/commit/8ed57f400fd083fbef7528f51231f59ecd3b1bee))
* add authentication with default admin user ([2189628](https://github.com/snapotter-hq/snapotter/commit/2189628861b83ffd29b60841f2ee74458a76a7cc))
* add automatic workspace file cleanup cron ([5af7437](https://github.com/snapotter-hq/snapotter/commit/5af7437d809a4e68376d68d201bf56700711836c))
* add CSS transform props to ImageViewer for live rotate/flip preview ([de3340f](https://github.com/snapotter-hq/snapotter/commit/de3340fc5b201cc5c046cbb38a274e7dfa026b41))
* add CSS transform props to ImageViewer for live rotate/flip preview ([7627853](https://github.com/snapotter-hq/snapotter/commit/762785394b2e66a25ee858da96868cd752942a7d))
* add Fastify API server with health check and env config ([be73ce9](https://github.com/snapotter-hq/snapotter/commit/be73ce9a2bcbab3c6a72fa735a500c6b83f86a9c))
* add forced password change page on first login ([e0900a8](https://github.com/snapotter-hq/snapotter/commit/e0900a877643c75266aeed5ac29501458ef0dcda))
* add format tools (SVG-to-raster, vectorize, GIF) and optimization (rename, favicon, image-to-PDF) ([7b29b04](https://github.com/snapotter-hq/snapotter/commit/7b29b043d850de46c5cf4ef1829f8a97dc9a0143))
* add generic tool page template with settings panel and dropzone ([0f32ba1](https://github.com/snapotter-hq/snapotter/commit/0f32ba10327f2fe96594544e0c7dc1b20ca479b0))
* add image-engine and ai stub packages ([17ac7b8](https://github.com/snapotter-hq/snapotter/commit/17ac7b83658c29a3e7a7711536c0648b3b23420a))
* add layout tools (collage, splitting, border/frame) ([e46dbf6](https://github.com/snapotter-hq/snapotter/commit/e46dbf6efb61e2812a7eb4c50a29b9391cd50654))
* add live preview callback to RotateSettings, rename button to Apply ([17be50b](https://github.com/snapotter-hq/snapotter/commit/17be50b213e1ca6d1d6e8d949b65de70c68d108d))
* add live preview callback to RotateSettings, rename button to Apply ([06844ec](https://github.com/snapotter-hq/snapotter/commit/06844ec1ada4d5685691f26655ecb8712b4d94d9))
* add login page with split layout matching SnapOtter style ([2b82f93](https://github.com/snapotter-hq/snapotter/commit/2b82f93b083c7a5bfcd37c25e85e5887c09c87ae))
* add multi-stage Docker build with Python ML dependencies ([8d70123](https://github.com/snapotter-hq/snapotter/commit/8d7012398973fd561db7b868dd2d50c2e71d2ed7))
* add MultiImageViewer with arrow navigation and filmstrip ([1fa8747](https://github.com/snapotter-hq/snapotter/commit/1fa874758ca58efb4b9f68d76a02648d6a84abfe))
* add password generator and browser save prompt on change-password page ([d56c644](https://github.com/snapotter-hq/snapotter/commit/d56c6446fee8384ab61ba180160f5e020a1e412e))
* add Phase 4 AI tools with Python bridge and 6 new tools ([21df50e](https://github.com/snapotter-hq/snapotter/commit/21df50e140248ca51bc82fbc7b16748cf0f9c909))
* add privacy policy page and fix CSP blocking API docs ([3e314f0](https://github.com/snapotter-hq/snapotter/commit/3e314f032491c59196db3493d0b86f6aeec22c63))
* add processAllFiles batch method to tool processor hook ([cd1e180](https://github.com/snapotter-hq/snapotter/commit/cd1e18026fb4b866c4bbde6c259412674a501f05))
* add replace-color tool and update tool page routing ([d5d09e4](https://github.com/snapotter-hq/snapotter/commit/d5d09e4a0f23091fb251cd15e17a639cf72a407a))
* add semantic-release for automated versioning and help dialog ([83a0272](https://github.com/snapotter-hq/snapotter/commit/83a0272af284f182fa32e7fd9baa77fe2bd74e39))
* add shared package with types, tool definitions, and constants ([96ed415](https://github.com/snapotter-hq/snapotter/commit/96ed4159a57fd27f8bb3214ec01bd085a5b34a54))
* add SideBySideComparison component for resize results ([d037305](https://github.com/snapotter-hq/snapotter/commit/d037305f29a32ead0addf6d79ace4823c9ba0e2b))
* add SideBySideComparison component for resize results ([2d0ba5a](https://github.com/snapotter-hq/snapotter/commit/2d0ba5a65683b45a6382ca1aea9f7a75d1143702))
* add SQLite database with Drizzle ORM schema and migrations ([88c41cf](https://github.com/snapotter-hq/snapotter/commit/88c41cf27c79004fc02df0afc67c4bbc4aa1cd2f))
* add SnapOtter-style layout with sidebar, tool panel, dropzone, and theme toggle ([90f10f4](https://github.com/snapotter-hq/snapotter/commit/90f10f41510136ec1fde90a00bf62f1940a10d6e))
* add Swagger/OpenAPI documentation at /api/docs ([0ef1a5a](https://github.com/snapotter-hq/snapotter/commit/0ef1a5a021893049fece83b48b4e178db4675813))
* add theme system with dark/light/system support and persistence ([e35d249](https://github.com/snapotter-hq/snapotter/commit/e35d249ac80616754b93d67da367d0e43df20064))
* add ThumbnailStrip filmstrip component ([9caa613](https://github.com/snapotter-hq/snapotter/commit/9caa613883a7f0f0ccfbb268d3e88596e92ce094))
* add utility tools (image info, compare, duplicates, color palette, QR, barcode) ([e17992e](https://github.com/snapotter-hq/snapotter/commit/e17992e6bdf4ee99980e851270c788e7a478a64f))
* add Vite + React SPA with Tailwind CSS and routing ([9483ad7](https://github.com/snapotter-hq/snapotter/commit/9483ad740e46adc5f2fa6b5c4992f19d429dacaf))
* add watermark, text overlay, and image composition tools ([b2543d9](https://github.com/snapotter-hq/snapotter/commit/b2543d9b5fc8e33a10d36c0cf32d7cb2de1e7901))
* add worker threads, persistent Python sidecar, graceful shutdown, and architectural improvements ([1274cc1](https://github.com/snapotter-hq/snapotter/commit/1274cc103fa2f0f934e9e2322c6034533ab62ec4))
* **adjustments:** add real-time live preview for all color tools ([b5c924e](https://github.com/snapotter-hq/snapotter/commit/b5c924e0fc7468c6364ef320958cea2e5ef18420))
* **ai:** add emit_progress() calls to all Python AI scripts ([eb6f57d](https://github.com/snapotter-hq/snapotter/commit/eb6f57dfa35fa10ada4493e9fd73fe4d4788c03c))
* **ai:** add onProgress callback to all AI wrapper functions ([021c9f1](https://github.com/snapotter-hq/snapotter/commit/021c9f12b5a1aca6c6c7cb8c9d9fad3d0406ab94))
* **ai:** rewrite bridge.ts to stream stderr progress via spawn ([9d9c45a](https://github.com/snapotter-hq/snapotter/commit/9d9c45a04c2a85e99021a35a3da94e1e19cb9043))
* **api,web:** add batch processing with ZIP download and SSE progress ([f8aa5f7](https://github.com/snapotter-hq/snapotter/commit/f8aa5f7bf2d81fc06e1118741d011023c2a4889b))
* **api:** add all remaining endpoints to OpenAPI spec ([e7b38ba](https://github.com/snapotter-hq/snapotter/commit/e7b38ba68f8ae7fae5675bafc0f2dc2c4f22ecd2))
* **api:** add all tool endpoints to OpenAPI spec ([753ba3e](https://github.com/snapotter-hq/snapotter/commit/753ba3e4689b1a3504960d15d1ebceaf2a08876e))
* **api:** add generic tool route factory for all image tools ([43555c9](https://github.com/snapotter-hq/snapotter/commit/43555c90ecedcb9364de73d51003e657f649c126))
* **api:** add llms.txt and llms-full.txt endpoints ([12ba52a](https://github.com/snapotter-hq/snapotter/commit/12ba52a6a0c1260f02a4d7787be8113383575d9e))
* **api:** add logo upload/serve/delete routes with tests ([6063f4d](https://github.com/snapotter-hq/snapotter/commit/6063f4daa98acf3f03e004a588de562e377105c7))
* **api:** add multipart file upload, workspace management, and download routes ([415de2a](https://github.com/snapotter-hq/snapotter/commit/415de2a5dff2c5344d38dd3b3d31513d5c2ed85b))
* **api:** add OpenAPI 3.1 spec skeleton with common schemas ([b2189f5](https://github.com/snapotter-hq/snapotter/commit/b2189f556815ef8d5c781eee72b8263db09f6a1a))
* **api:** add persistent file management helpers to frontend api module ([ecbfcce](https://github.com/snapotter-hq/snapotter/commit/ecbfcceec82010fa44244c6839928b9930d59b5a))
* **api:** add pipeline execution, save, and list endpoints ([d4f1148](https://github.com/snapotter-hq/snapotter/commit/d4f1148860d7801f8d0fd276d6a2ec9efa1f68af))
* **api:** add resize, crop, rotate, convert, compress, metadata, and color tool routes ([4874701](https://github.com/snapotter-hq/snapotter/commit/48747016ed71ad8300d463e8128b922177c23721))
* **api:** add Scalar docs route and install dependency ([6f2c319](https://github.com/snapotter-hq/snapotter/commit/6f2c3190b8414d1c4c3b1a78cf7a86a96109c934))
* **api:** add SingleFileProgress type and SSE update function ([12b85d4](https://github.com/snapotter-hq/snapotter/commit/12b85d4def1f29ca291d6f5e538181f2bcbcf774))
* **api:** add teams CRUD routes and update auth team references ([ec22e53](https://github.com/snapotter-hq/snapotter/commit/ec22e53a3b15ae030743e76db0d57584000727b6))
* **api:** add tool filtering and DB-backed cleanup settings ([07e7e8d](https://github.com/snapotter-hq/snapotter/commit/07e7e8d58d311d89f43cee1c7fa21dd0eb4c9dfb))
* **api:** add user files CRUD routes at /api/v1/files/* ([6a07007](https://github.com/snapotter-hq/snapotter/commit/6a070071456611d2bf2acf4a474be8c43680e1b0))
* **api:** register docs route in server and test helper ([bc6b389](https://github.com/snapotter-hq/snapotter/commit/bc6b38918ff11f1027efeb934ae0e56d6068b81f))
* **api:** wire AI route handlers to SSE progress via clientJobId ([a3f85da](https://github.com/snapotter-hq/snapotter/commit/a3f85da20f73f02cd5ec141519aa73fcfeb2157b))
* **branding:** add faceted gem SVG logo assets ([4bc9335](https://github.com/snapotter-hq/snapotter/commit/4bc93351541b039534197821d290d34cad12c9a7))
* **branding:** add favicon and meta tags to index.html ([2508fd0](https://github.com/snapotter-hq/snapotter/commit/2508fd04871cdb776523ec9d602ad934283c6211))
* **branding:** add OG social preview image ([c6c5b92](https://github.com/snapotter-hq/snapotter/commit/c6c5b926e271d457effea9aec07b70bbc7227ef5))
* **branding:** add PWA manifest and PNG logo assets ([298567d](https://github.com/snapotter-hq/snapotter/commit/298567d090f298600b334184b09d35c178097362))
* **branding:** show gem icon in app header as default logo ([dd857fb](https://github.com/snapotter-hq/snapotter/commit/dd857fbcc778a2425806f1d96d83f118dc92831a))
* conditional result views — side-by-side for resize, live preview for rotate ([f0d18be](https://github.com/snapotter-hq/snapotter/commit/f0d18bee5ebc110e63bb3cf9fd829d80900759ce))
* conditional result views — side-by-side for resize, live preview for rotate ([6682649](https://github.com/snapotter-hq/snapotter/commit/668264990c33667e586e4e24703f1957b18e1c0c))
* **crop:** add CropCanvas component with visual overlay, grid, and keyboard controls ([018bbf4](https://github.com/snapotter-hq/snapotter/commit/018bbf44bfed4acf475de49ff9f3f5c20ee63295))
* **crop:** add react-image-crop dependency ([b7ecd41](https://github.com/snapotter-hq/snapotter/commit/b7ecd41897de4f48e6f970dfbb1188848e9bcd2a))
* **crop:** redesign CropSettings with aspect presets, pixel inputs, and grid toggle ([d75f458](https://github.com/snapotter-hq/snapotter/commit/d75f458dc0f13e69640bc012adea0ee29d02b82b))
* **crop:** wire CropCanvas and CropSettings into tool-page with bidirectional state ([ea7fb46](https://github.com/snapotter-hq/snapotter/commit/ea7fb46f7ecad5639c007ba43d652fd72c75b39f))
* **db:** add teams table and migration ([365783b](https://github.com/snapotter-hq/snapotter/commit/365783b6dc1f5cfa631bb4f6915fcf99d91f574d))
* **db:** add userFiles table and migration ([a2fdbd5](https://github.com/snapotter-hq/snapotter/commit/a2fdbd5fef2cf02f90692166d6386c5ac21c2cef))
* **docs:** add gem favicon to VitePress site ([0918f93](https://github.com/snapotter-hq/snapotter/commit/0918f933719ae0d8ff16cf7a8ac0e8936e90805a))
* **docs:** add gem logo to GitHub Pages nav bar and home hero ([f0b8162](https://github.com/snapotter-hq/snapotter/commit/f0b8162955fa8f6b1891968163b4292b279f1ea1))
* **docs:** add llms.txt and llms-full.txt to GitHub Pages ([5f6959a](https://github.com/snapotter-hq/snapotter/commit/5f6959a21e3b2708edb011a0a7ce48fbfbc64c87))
* **docs:** add llms.txt links to GitHub Pages footer ([b874445](https://github.com/snapotter-hq/snapotter/commit/b874445dc6d31c54a095d7471390e664b233d491))
* **env:** add FILES_STORAGE_PATH config variable ([3c737a6](https://github.com/snapotter-hq/snapotter/commit/3c737a6c724f4862d302bf22a75ebcd745f0df4c))
* **erase-object:** replace mask upload with in-browser brush painting ([40e3081](https://github.com/snapotter-hq/snapotter/commit/40e30815915f18f9f7fc25c05a61c643f1dfdbe4))
* extract auto-orient utility and expand test coverage ([8622c4a](https://github.com/snapotter-hq/snapotter/commit/8622c4a40245504372e75d3cd851535528639dea))
* **files:** add Files page with nav, list, details, upload, and routing ([3f127a4](https://github.com/snapotter-hq/snapotter/commit/3f127a457e8a7a07d22fdf8776c3166092db562f))
* **files:** add mobile layout for Files page ([e864d1e](https://github.com/snapotter-hq/snapotter/commit/e864d1e430bd516ccbe1732ec7451e1e7d670177))
* **files:** wire serverFileId for version tracking ([8868d3e](https://github.com/snapotter-hq/snapotter/commit/8868d3e556beedcff35de268e72241e7f10998a3))
* harden auth, security headers, SVG sanitization, and pipeline ownership ([beaad1d](https://github.com/snapotter-hq/snapotter/commit/beaad1d3044f6b2535aacb6a67541464f736778b))
* **i18n:** add translation keys for settings phase 1 ([c5ff80a](https://github.com/snapotter-hq/snapotter/commit/c5ff80acfbe18b953cfd96a88498fc70b82b541e))
* **image-engine:** add Sharp wrapper with 14 image operations ([3e7f71c](https://github.com/snapotter-hq/snapotter/commit/3e7f71ca830549ea28b47656b14b9375fa8c2c34))
* **image-to-pdf:** add live PDF page preview with margin visualization ([cd666ea](https://github.com/snapotter-hq/snapotter/commit/cd666eaef0b13bcd9223439f0bbb5efd88b2f25e))
* implement Files page with persistent storage and version tracking ([f6183d2](https://github.com/snapotter-hq/snapotter/commit/f6183d2c62e6ad04dec3fe0250468cbfd6cbc035))
* initialize Turborepo monorepo with pnpm workspaces ([db31cf6](https://github.com/snapotter-hq/snapotter/commit/db31cf6f115c454eb59454fc227058a773944f93))
* integrate MultiImageViewer and multi-file UX into tool page ([52aab1e](https://github.com/snapotter-hq/snapotter/commit/52aab1e2bf5f938a800a78b4e5c11f5ad9fbae27))
* make AI tools pipeline-compatible and add search to tool picker ([2d46b09](https://github.com/snapotter-hq/snapotter/commit/2d46b096fa80e43f7a59e213ac884b5d1d30b586))
* merge multi-image UX — batch processing, filmstrip navigation, resize/rotate redesign ([9bfdb75](https://github.com/snapotter-hq/snapotter/commit/9bfdb75f5c205906f2bd62d496e96d6b402e1dc1))
* multi-arch Docker support, security hardening, and test improvements ([748d2b7](https://github.com/snapotter-hq/snapotter/commit/748d2b70460b3975a9c61edec0b121d788d0ee06))
* multi-file metadata display with per-file caching ([42b59f3](https://github.com/snapotter-hq/snapotter/commit/42b59f3e2d84b3d9fd6724b9ed9fb272fb11201a))
* **pipeline:** add inline settings configuration for automation steps ([827eae8](https://github.com/snapotter-hq/snapotter/commit/827eae824543ab9cea2a5d3a82acd388736fa424))
* production Docker, Playwright tests, settings API, and bug fixes ([027c515](https://github.com/snapotter-hq/snapotter/commit/027c515f3582c5f030fb4c3cacae2ceee575e7c7))
* replace model dropdown with intuitive subject/quality selector in remove-bg ([bc26d60](https://github.com/snapotter-hq/snapotter/commit/bc26d60d54a47a9fb6f58115131845d1ae5ee868))
* rewrite file-store with FileEntry model for multi-image support ([abbb3e4](https://github.com/snapotter-hq/snapotter/commit/abbb3e4d6e8f21f35b385c51fb659010099556d1))
* rewrite resize settings with tab-based UI (presets, custom, scale) ([b9f3ac0](https://github.com/snapotter-hq/snapotter/commit/b9f3ac0d222f3712d35becd6c831dc62f728a16a))
* rewrite resize settings with tab-based UI (presets, custom, scale) ([3b39a8c](https://github.com/snapotter-hq/snapotter/commit/3b39a8cc5f11a5093f42bcdbe97989fce3841616))
* **rotate:** add editable angle input and fine-tune +/- buttons ([e1f04c2](https://github.com/snapotter-hq/snapotter/commit/e1f04c28a6b03c0503266c0e78e7a9161011d939))
* serve React SPA from Fastify in production mode ([d4ae4d5](https://github.com/snapotter-hq/snapotter/commit/d4ae4d586a60fe88f6834e5f32b89f7ef3d3bc7e))
* **storage:** add file storage helpers module ([7c37213](https://github.com/snapotter-hq/snapotter/commit/7c372135c8eb9d65198c0720bc2d0c83ac145004))
* **stores:** add Zustand store for Files page state management ([fb487be](https://github.com/snapotter-hq/snapotter/commit/fb487be051c6da6ca22a443323cf4788d4ca4e6b))
* **tool-factory:** auto-save results to persistent file store when fileId provided ([27d8629](https://github.com/snapotter-hq/snapotter/commit/27d8629c704bc9cabed8c7dd87c34ea8e9433347))
* **ui:** add teams, tools, feature flags, temp files, logo to settings dialog ([fbce0dd](https://github.com/snapotter-hq/snapotter/commit/fbce0dddd05c1e539bfbdb084c3b53d59f5dfd76))
* upgrade to BiRefNet SOTA background removal model ([f53937b](https://github.com/snapotter-hq/snapotter/commit/f53937b07006c6de26096467a106b0a055a4c95e))
* **web:** add before/after image comparison slider component ([64c8f90](https://github.com/snapotter-hq/snapotter/commit/64c8f908d7f188e079ff3bd5f469f5ab701cc25d))
* **web:** add fullscreen tool grid view ([86b716b](https://github.com/snapotter-hq/snapotter/commit/86b716b76514494a3611798e0651f8dc3601ce8b))
* **web:** add i18n architecture with English translations ([994cba7](https://github.com/snapotter-hq/snapotter/commit/994cba77164c6f1a1b092e76f9fa441077639079))
* **web:** add keyboard shortcuts for tool navigation ([e06e44c](https://github.com/snapotter-hq/snapotter/commit/e06e44cf2763265acfe97b14e863f22bd60dd264))
* **web:** add mobile responsive layout with bottom navigation ([ade6469](https://github.com/snapotter-hq/snapotter/commit/ade64699adbe54bbfed39f1a3cba924c3caeaef1))
* **web:** add pipeline builder UI with saved automations and templates ([39a7bf2](https://github.com/snapotter-hq/snapotter/commit/39a7bf259b25bc31575376bdec036f4693c5e777))
* **web:** add ProgressCard component ([ed69488](https://github.com/snapotter-hq/snapotter/commit/ed6948804b52ee5d8977732130a55c6c1efc358d))
* **web:** add ProgressCard to non-AI tool settings (Group A) ([17035e9](https://github.com/snapotter-hq/snapotter/commit/17035e98abc84f7abd0de91b9c0b324403a31c71))
* **web:** add settings dialog with general, security, API keys, and about sections ([bca8e81](https://github.com/snapotter-hq/snapotter/commit/bca8e81e3ad73a7f39451c8e3cc6d105f6665dcf))
* **web:** add SnapOtter-style file preview, review panel, and tool chaining UX ([e12fc57](https://github.com/snapotter-hq/snapotter/commit/e12fc57ce101f7d68b718a2fb5bf3ea4884f69f2))
* **web:** add tool settings UI for all core image tools ([f9be6d6](https://github.com/snapotter-hq/snapotter/commit/f9be6d6eeff2ebe2d10fa69cc37993427f52ec76))
* **web:** migrate AI tool settings to ProgressCard ([eed4fc2](https://github.com/snapotter-hq/snapotter/commit/eed4fc28db80967aa3bb513459bf05d9b417d65f))
* **web:** redesign home page upload flow and add auth guard ([915a8cc](https://github.com/snapotter-hq/snapotter/commit/915a8cc2d5ecb8dc60b968cf85c5519a0c64cef6))
* **web:** rewrite useToolProcessor with XHR upload progress and SSE ([305f50b](https://github.com/snapotter-hq/snapotter/commit/305f50b5f4bd87cc19a3a8fe0d0374bb78bad101))
* wire up batch processing across tool settings components ([1d87091](https://github.com/snapotter-hq/snapotter/commit/1d87091bbc4bce9d8e78b0cddd474d21dd4dcd1c))

# [0.19.0](https://github.com/snapotter-hq/snapotter/compare/v0.18.0...v0.19.0) (2026-03-29)


### Features

* add privacy policy page and fix CSP blocking API docs ([3e314f0](https://github.com/snapotter-hq/snapotter/commit/3e314f032491c59196db3493d0b86f6aeec22c63))

# [0.18.0](https://github.com/snapotter-hq/snapotter/compare/v0.17.7...v0.18.0) (2026-03-29)


### Features

* add worker threads, persistent Python sidecar, graceful shutdown, and architectural improvements ([1274cc1](https://github.com/snapotter-hq/snapotter/commit/1274cc103fa2f0f934e9e2322c6034533ab62ec4))

## [0.17.7](https://github.com/snapotter-hq/snapotter/compare/v0.17.6...v0.17.7) (2026-03-28)


### Bug Fixes

* move health diagnostics behind admin auth ([ee9a20f](https://github.com/snapotter-hq/snapotter/commit/ee9a20f6a35a0681b3688f0e206914fceed8fd8c))
* reject HTML tags in settings API to prevent stored XSS ([d5bd011](https://github.com/snapotter-hq/snapotter/commit/d5bd01189766ee0797fe35ff3651f38f59a65881))
* simplify public health to static response, add 403 test ([9c05da6](https://github.com/snapotter-hq/snapotter/commit/9c05da6f1372abd071e5249b102d86fa294e0d22))
* switch README Docker references from GHCR to Docker Hub ([9e15679](https://github.com/snapotter-hq/snapotter/commit/9e1567971d50d755ef3b51d31e80b5a31a28ed2d))
* use two-pass validation in settings PUT to prevent partial writes ([2dc39d3](https://github.com/snapotter-hq/snapotter/commit/2dc39d353320b73d9abb96ee5ae1080c2ee2f9cb))

## [0.17.6](https://github.com/snapotter-hq/snapotter/compare/v0.17.5...v0.17.6) (2026-03-28)


### Bug Fixes

* resolve pipeline step race condition and infinite re-render loop ([e0177d4](https://github.com/snapotter-hq/snapotter/commit/e0177d405ef043a64f0b3a885e98169312be1fac))
* show checkerboard behind transparent images in before/after slider ([73741e6](https://github.com/snapotter-hq/snapotter/commit/73741e6efbdee53396810a2bb11eaf9597e4aa32))

## [0.17.5](https://github.com/snapotter-hq/snapotter/compare/v0.17.4...v0.17.5) (2026-03-28)


### Bug Fixes

* sync stepsRef during render, not useEffect ([0c86744](https://github.com/snapotter-hq/snapotter/commit/0c86744dda1073988c7e6bb55073f08e399c26f3))

## [0.17.4](https://github.com/snapotter-hq/snapotter/compare/v0.17.3...v0.17.4) (2026-03-28)


### Bug Fixes

* prevent stale closure in pipeline step callbacks ([c67f002](https://github.com/snapotter-hq/snapotter/commit/c67f0027804f167e250bd497505399c07b539c4e))

## [0.17.3](https://github.com/snapotter-hq/snapotter/compare/v0.17.2...v0.17.3) (2026-03-28)


### Bug Fixes

* clear search when adding a step from the tool picker ([ae2e63f](https://github.com/snapotter-hq/snapotter/commit/ae2e63f7fc4af3556539eee577b253c0616cbd0f))

## [0.17.2](https://github.com/snapotter-hq/snapotter/compare/v0.17.1...v0.17.2) (2026-03-28)


### Bug Fixes

* prevent pipeline step settings from resetting on collapse ([d899ef1](https://github.com/snapotter-hq/snapotter/commit/d899ef128004e46200da785a960da50894e93861))

## [0.17.1](https://github.com/snapotter-hq/snapotter/compare/v0.17.0...v0.17.1) (2026-03-28)


### Bug Fixes

* add remove-background settings to pipeline step configurator ([ae5ac81](https://github.com/snapotter-hq/snapotter/commit/ae5ac8134689e211f17534f3064995597b6337c8))

# [0.17.0](https://github.com/snapotter-hq/snapotter/compare/v0.16.4...v0.17.0) (2026-03-28)


### Features

* make AI tools pipeline-compatible and add search to tool picker ([2d46b09](https://github.com/snapotter-hq/snapotter/commit/2d46b096fa80e43f7a59e213ac884b5d1d30b586))

## [0.16.4](https://github.com/snapotter-hq/snapotter/compare/v0.16.3...v0.16.4) (2026-03-28)


### Bug Fixes

* surface hidden errors and add batch rejection tests ([2f8e2ce](https://github.com/snapotter-hq/snapotter/commit/2f8e2ce7e2b96613ebda249890632bc54c11980b))

## [0.16.3](https://github.com/snapotter-hq/snapotter/compare/v0.16.2...v0.16.3) (2026-03-28)


### Bug Fixes

* remove Google Drive coming soon placeholder from files nav ([e487fe0](https://github.com/snapotter-hq/snapotter/commit/e487fe06bf4cad6512100bf9660498e06c1047ba))

## [0.16.2](https://github.com/snapotter-hq/snapotter/compare/v0.16.1...v0.16.2) (2026-03-28)


### Bug Fixes

* pipeline only shows compatible tools and displays errors ([fe021c1](https://github.com/snapotter-hq/snapotter/commit/fe021c18b134c853262c8f0dac81c13f9ceeb435))

## [0.16.1](https://github.com/snapotter-hq/snapotter/compare/v0.16.0...v0.16.1) (2026-03-28)


### Bug Fixes

* trigger browser password save prompt on password change ([6b279ad](https://github.com/snapotter-hq/snapotter/commit/6b279ad09b9e74de34732b0e854f1180f25b34bd))

# [0.16.0](https://github.com/snapotter-hq/snapotter/compare/v0.15.0...v0.16.0) (2026-03-28)


### Features

* add password generator and browser save prompt on change-password page ([d56c644](https://github.com/snapotter-hq/snapotter/commit/d56c6446fee8384ab61ba180160f5e020a1e412e))

# [0.15.0](https://github.com/snapotter-hq/snapotter/compare/v0.14.2...v0.15.0) (2026-03-28)


### Features

* add forced password change page on first login ([e0900a8](https://github.com/snapotter-hq/snapotter/commit/e0900a877643c75266aeed5ac29501458ef0dcda))

## [0.14.2](https://github.com/snapotter-hq/snapotter/compare/v0.14.1...v0.14.2) (2026-03-28)


### Bug Fixes

* **tests:** remove temp DB cleanup that races with other test files ([498bfb3](https://github.com/snapotter-hq/snapotter/commit/498bfb3def2d6786fa5e387b3e30ede9768ef616))

## [0.14.1](https://github.com/snapotter-hq/snapotter/compare/v0.14.0...v0.14.1) (2026-03-28)


### Bug Fixes

* handle migration race condition in concurrent test workers ([d576ab1](https://github.com/snapotter-hq/snapotter/commit/d576ab1dfb1e9d2aa739c681c1f83d6fef3f7d22))

# [0.14.0](https://github.com/snapotter-hq/snapotter/compare/v0.13.1...v0.14.0) (2026-03-28)


### Features

* multi-arch Docker support, security hardening, and test improvements ([748d2b7](https://github.com/snapotter-hq/snapotter/commit/748d2b70460b3975a9c61edec0b121d788d0ee06))

## [0.13.1](https://github.com/snapotter-hq/snapotter/compare/v0.13.0...v0.13.1) (2026-03-27)


### Bug Fixes

* **docs:** remove hero logo from home page ([64c0ec8](https://github.com/snapotter-hq/snapotter/commit/64c0ec895f82b09e50d5ecf2b85f759f0a481232))

# [0.13.0](https://github.com/snapotter-hq/snapotter/compare/v0.12.1...v0.13.0) (2026-03-27)


### Features

* **docs:** add gem logo to GitHub Pages nav bar and home hero ([f0b8162](https://github.com/snapotter-hq/snapotter/commit/f0b8162955fa8f6b1891968163b4292b279f1ea1))

## [0.12.1](https://github.com/snapotter-hq/snapotter/compare/v0.12.0...v0.12.1) (2026-03-27)


### Bug Fixes

* **docs:** clean up footer llms.txt links ([e842cde](https://github.com/snapotter-hq/snapotter/commit/e842cde838ad3deb1437c4c43c8ccd796276248c))

# [0.12.0](https://github.com/snapotter-hq/snapotter/compare/v0.11.1...v0.12.0) (2026-03-27)


### Bug Fixes

* **api:** resolve team name lookup and show server error messages ([609fc8b](https://github.com/snapotter-hq/snapotter/commit/609fc8b6cc2d2408226e2576c35d7715bdf1498c))


### Features

* **docs:** add llms.txt links to GitHub Pages footer ([b874445](https://github.com/snapotter-hq/snapotter/commit/b874445dc6d31c54a095d7471390e664b233d491))

## [0.11.1](https://github.com/snapotter-hq/snapotter/compare/v0.11.0...v0.11.1) (2026-03-27)


### Bug Fixes

* **docs:** ignore localhost dead links in VitePress build ([78269d4](https://github.com/snapotter-hq/snapotter/commit/78269d499c914d5d68c4455475a1608f4af2a075))

# [0.11.0](https://github.com/snapotter-hq/snapotter/compare/v0.10.0...v0.11.0) (2026-03-27)


### Bug Fixes

* **a11y:** add aria-hidden to decorative GemLogo SVG ([ae185ce](https://github.com/snapotter-hq/snapotter/commit/ae185ce767a480719d2f54d5675cbd7d64beb7b5))
* **api:** allow Scalar docs through auth and CSP ([6023109](https://github.com/snapotter-hq/snapotter/commit/6023109df9c66c1e7b4d81f3e902f081809ed6ba))
* **api:** use content instead of spec.content for Scalar v1.49 API ([dfcb4d5](https://github.com/snapotter-hq/snapotter/commit/dfcb4d579f4b44013d23dff8617d9a9f6315b452))
* **ui:** clean up settings, automate page, fullscreen logo, and README ([b3c8ad4](https://github.com/snapotter-hq/snapotter/commit/b3c8ad4697000454a11aaace27d0baa37a9959d9))


### Features

* **api:** add all remaining endpoints to OpenAPI spec ([e7b38ba](https://github.com/snapotter-hq/snapotter/commit/e7b38ba68f8ae7fae5675bafc0f2dc2c4f22ecd2))
* **api:** add all tool endpoints to OpenAPI spec ([753ba3e](https://github.com/snapotter-hq/snapotter/commit/753ba3e4689b1a3504960d15d1ebceaf2a08876e))
* **api:** add llms.txt and llms-full.txt endpoints ([12ba52a](https://github.com/snapotter-hq/snapotter/commit/12ba52a6a0c1260f02a4d7787be8113383575d9e))
* **api:** add OpenAPI 3.1 spec skeleton with common schemas ([b2189f5](https://github.com/snapotter-hq/snapotter/commit/b2189f556815ef8d5c781eee72b8263db09f6a1a))
* **api:** add Scalar docs route and install dependency ([6f2c319](https://github.com/snapotter-hq/snapotter/commit/6f2c3190b8414d1c4c3b1a78cf7a86a96109c934))
* **api:** register docs route in server and test helper ([bc6b389](https://github.com/snapotter-hq/snapotter/commit/bc6b38918ff11f1027efeb934ae0e56d6068b81f))
* **branding:** add faceted gem SVG logo assets ([4bc9335](https://github.com/snapotter-hq/snapotter/commit/4bc93351541b039534197821d290d34cad12c9a7))
* **branding:** add favicon and meta tags to index.html ([2508fd0](https://github.com/snapotter-hq/snapotter/commit/2508fd04871cdb776523ec9d602ad934283c6211))
* **branding:** add OG social preview image ([c6c5b92](https://github.com/snapotter-hq/snapotter/commit/c6c5b926e271d457effea9aec07b70bbc7227ef5))
* **branding:** add PWA manifest and PNG logo assets ([298567d](https://github.com/snapotter-hq/snapotter/commit/298567d090f298600b334184b09d35c178097362))
* **branding:** show gem icon in app header as default logo ([dd857fb](https://github.com/snapotter-hq/snapotter/commit/dd857fbcc778a2425806f1d96d83f118dc92831a))
* **docs:** add gem favicon to VitePress site ([0918f93](https://github.com/snapotter-hq/snapotter/commit/0918f933719ae0d8ff16cf7a8ac0e8936e90805a))
* **docs:** add llms.txt and llms-full.txt to GitHub Pages ([5f6959a](https://github.com/snapotter-hq/snapotter/commit/5f6959a21e3b2708edb011a0a7ce48fbfbc64c87))

# [0.10.0](https://github.com/snapotter-hq/snapotter/compare/v0.9.0...v0.10.0) (2026-03-26)


### Bug Fixes

* **ocr:** update PaddleOCR for v3 API and add Tesseract fallback ([e260a93](https://github.com/snapotter-hq/snapotter/commit/e260a93cf65f1e7cd22b7b5d491c6125fee8c915))


### Features

* **erase-object:** replace mask upload with in-browser brush painting ([40e3081](https://github.com/snapotter-hq/snapotter/commit/40e30815915f18f9f7fc25c05a61c643f1dfdbe4))

# [0.9.0](https://github.com/snapotter-hq/snapotter/compare/v0.8.2...v0.9.0) (2026-03-26)


### Bug Fixes

* **blur-faces:** switch from MediaPipe to OpenCV and auto-orient images ([dc10f90](https://github.com/snapotter-hq/snapotter/commit/dc10f905c62c662f1a40701c81874e5854ea33e6))
* **docker:** add build layer caching for faster Docker rebuilds ([03ba30d](https://github.com/snapotter-hq/snapotter/commit/03ba30d8f01c5c2500641d934b08a875589bcd68))
* **upscale:** auto-orient images before upscaling and improve UI ([8a6e665](https://github.com/snapotter-hq/snapotter/commit/8a6e665a4484bda1e4b93b520c393bb707a624aa))


### Features

* **adjustments:** add real-time live preview for all color tools ([b5c924e](https://github.com/snapotter-hq/snapotter/commit/b5c924e0fc7468c6364ef320958cea2e5ef18420))
* **image-to-pdf:** add live PDF page preview with margin visualization ([cd666ea](https://github.com/snapotter-hq/snapotter/commit/cd666eaef0b13bcd9223439f0bbb5efd88b2f25e))
* **rotate:** add editable angle input and fine-tune +/- buttons ([e1f04c2](https://github.com/snapotter-hq/snapotter/commit/e1f04c28a6b03c0503266c0e78e7a9161011d939))

## [0.8.2](https://github.com/snapotter-hq/snapotter/compare/v0.8.1...v0.8.2) (2026-03-25)


### Bug Fixes

* **test:** add missing PNG fixture files to repo ([45c6b9d](https://github.com/snapotter-hq/snapotter/commit/45c6b9de08124fb357ac759e43c4fbf1eb5fbfb9))
* **test:** exclude e2e tests from vitest and fix CI test suite ([9d28485](https://github.com/snapotter-hq/snapotter/commit/9d28485339e17b80586cea91bd18dafc989d7f24))

## [0.8.1](https://github.com/snapotter-hq/snapotter/compare/v0.8.0...v0.8.1) (2026-03-25)


### Bug Fixes

* resolve test failures from shared DB race conditions ([1a7116d](https://github.com/snapotter-hq/snapotter/commit/1a7116d79072d131b94d1c454abbc32b9e961c1b))

# [0.8.0](https://github.com/snapotter-hq/snapotter/compare/v0.7.0...v0.8.0) (2026-03-25)


### Bug Fixes

* **docker:** skip husky prepare script in production install ([fdfb0a0](https://github.com/snapotter-hq/snapotter/commit/fdfb0a0e7412c86e3b85a70daf5093f44c34ee99))
* prevent useAuth infinite loop causing rate limit storms ([9624dae](https://github.com/snapotter-hq/snapotter/commit/9624dae1569b6f2ad52ce990fc84eca809b849a8))


### Features

* **api:** add logo upload/serve/delete routes with tests ([6063f4d](https://github.com/snapotter-hq/snapotter/commit/6063f4daa98acf3f03e004a588de562e377105c7))
* **api:** add persistent file management helpers to frontend api module ([ecbfcce](https://github.com/snapotter-hq/snapotter/commit/ecbfcceec82010fa44244c6839928b9930d59b5a))
* **api:** add teams CRUD routes and update auth team references ([ec22e53](https://github.com/snapotter-hq/snapotter/commit/ec22e53a3b15ae030743e76db0d57584000727b6))
* **api:** add tool filtering and DB-backed cleanup settings ([07e7e8d](https://github.com/snapotter-hq/snapotter/commit/07e7e8d58d311d89f43cee1c7fa21dd0eb4c9dfb))
* **api:** add user files CRUD routes at /api/v1/files/* ([6a07007](https://github.com/snapotter-hq/snapotter/commit/6a070071456611d2bf2acf4a474be8c43680e1b0))
* **db:** add teams table and migration ([365783b](https://github.com/snapotter-hq/snapotter/commit/365783b6dc1f5cfa631bb4f6915fcf99d91f574d))
* **db:** add userFiles table and migration ([a2fdbd5](https://github.com/snapotter-hq/snapotter/commit/a2fdbd5fef2cf02f90692166d6386c5ac21c2cef))
* **env:** add FILES_STORAGE_PATH config variable ([3c737a6](https://github.com/snapotter-hq/snapotter/commit/3c737a6c724f4862d302bf22a75ebcd745f0df4c))
* **files:** add Files page with nav, list, details, upload, and routing ([3f127a4](https://github.com/snapotter-hq/snapotter/commit/3f127a457e8a7a07d22fdf8776c3166092db562f))
* **files:** add mobile layout for Files page ([e864d1e](https://github.com/snapotter-hq/snapotter/commit/e864d1e430bd516ccbe1732ec7451e1e7d670177))
* **files:** wire serverFileId for version tracking ([8868d3e](https://github.com/snapotter-hq/snapotter/commit/8868d3e556beedcff35de268e72241e7f10998a3))
* **i18n:** add translation keys for settings phase 1 ([c5ff80a](https://github.com/snapotter-hq/snapotter/commit/c5ff80acfbe18b953cfd96a88498fc70b82b541e))
* implement Files page with persistent storage and version tracking ([f6183d2](https://github.com/snapotter-hq/snapotter/commit/f6183d2c62e6ad04dec3fe0250468cbfd6cbc035))
* **storage:** add file storage helpers module ([7c37213](https://github.com/snapotter-hq/snapotter/commit/7c372135c8eb9d65198c0720bc2d0c83ac145004))
* **stores:** add Zustand store for Files page state management ([fb487be](https://github.com/snapotter-hq/snapotter/commit/fb487be051c6da6ca22a443323cf4788d4ca4e6b))
* **tool-factory:** auto-save results to persistent file store when fileId provided ([27d8629](https://github.com/snapotter-hq/snapotter/commit/27d8629c704bc9cabed8c7dd87c34ea8e9433347))
* **ui:** add teams, tools, feature flags, temp files, logo to settings dialog ([fbce0dd](https://github.com/snapotter-hq/snapotter/commit/fbce0dddd05c1e539bfbdb084c3b53d59f5dfd76))

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

[Unreleased]: https://github.com/snapotter-hq/snapotter/compare/v0.7.0...HEAD
[0.7.0]: https://github.com/snapotter-hq/snapotter/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/snapotter-hq/snapotter/compare/v0.5.2...v0.6.0
[0.5.2]: https://github.com/snapotter-hq/snapotter/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/snapotter-hq/snapotter/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/snapotter-hq/snapotter/compare/v0.4.1...v0.5.0
[0.4.1]: https://github.com/snapotter-hq/snapotter/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/snapotter-hq/snapotter/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/snapotter-hq/snapotter/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/snapotter-hq/snapotter/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/snapotter-hq/snapotter/releases/tag/v0.2.1
