---
description: "전체 REST API 레퍼런스. 도구 엔드포인트, 배치 처리, 파이프라인, 파일 라이브러리, 인증, 팀, 관리 작업."
i18n_output_hash: a4289adc1b56
i18n_source_hash: 7e0a0db4abe0
i18n_provenance: human
---

# REST API 레퍼런스 {#rest-api-reference}

요청/응답 예제가 포함된 대화형 API 문서는 [http://localhost:1349/api/docs](http://localhost:1349/api/docs)에서 확인할 수 있습니다.

기계 판독 가능 스펙:
- `/api/v1/openapi.yaml` - OpenAPI 3.1 스펙
- `/llms.txt` - LLM 친화적 요약
- `/llms-full.txt` - 전체 LLM 친화적 문서

## 인증 {#authentication}

`AUTH_ENABLED=false`가 아닌 한 모든 엔드포인트는 인증이 필요합니다.

### 세션 토큰 {#session-token}

```bash
# Login
curl -X POST http://localhost:1349/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}'
# Returns: {"token":"<session-token>"}

# Use token
curl http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer <session-token>"
```

세션은 7일 후 만료됩니다(`SESSION_DURATION_HOURS`로 구성 가능).

### API 키 {#api-keys}

```bash
# Create a key (returns key once - store it)
curl -X POST http://localhost:1349/api/v1/api-keys \
  -H "Authorization: Bearer <session-token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"my-script"}'
# Returns: {"key":"si_<96 hex chars>","id":"...","name":"my-script"}

# Use the key
curl http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-key>"
```

키는 `si_` 접두사가 붙으며 scrypt 해시로 저장됩니다. 원본 키는 한 번만 표시되며 이후 다시 조회할 수 없습니다.

### 인증 엔드포인트 {#auth-endpoints}

| 메서드 | 경로 | 접근 권한 | 설명 |
|--------|------|--------|-------------|
| `POST` | `/api/auth/login` | 공개 | 로그인, 세션 토큰 획득 |
| `POST` | `/api/auth/logout` | 인증 | 현재 세션 종료 |
| `GET` | `/api/auth/session` | 인증 | 현재 세션 검증 |
| `POST` | `/api/auth/change-password` | 인증 | 본인 비밀번호 변경(다른 모든 세션 + API 키 무효화) |
| `GET` | `/api/auth/users` | 관리자 | 전체 사용자 목록 조회 |
| `POST` | `/api/auth/register` | 관리자 | 새 사용자 생성 |
| `PUT` | `/api/auth/users/:id` | 관리자 | 사용자 역할 또는 팀 업데이트 |
| `POST` | `/api/auth/users/:id/reset-password` | 관리자 | 사용자 비밀번호 재설정 |
| `DELETE` | `/api/auth/users/:id` | 관리자 | 사용자 삭제 |
| `GET` | `/api/v1/config/auth` | 공개 | 인증 활성화 여부 확인(`{ authEnabled: bool }`) |
| `POST` | `/api/auth/mfa/enroll` | 인증 | TOTP MFA 등록 시작. 엔터프라이즈 `mfa` 기능 필요 |
| `POST` | `/api/auth/mfa/verify` | 인증 | TOTP 코드로 MFA 등록 확인 |
| `POST` | `/api/auth/mfa/complete` | 공개 | 대기 중인 MFA 로그인 챌린지 완료 |
| `POST` | `/api/auth/mfa/disable` | 인증 | 현재 사용자의 MFA 비활성화 |
| `POST` | `/api/auth/users/:id/mfa/reset` | 관리자(`users:manage`) | 사용자의 MFA 재설정 |
| `GET` | `/api/auth/oidc/login` | 공개 | OIDC 활성화 시 OIDC 로그인 시작 |
| `GET` | `/api/auth/oidc/callback` | 공개 | OIDC 인가 콜백 |
| `GET` | `/api/auth/saml/metadata` | 공개 | SAML 활성화 시 SAML SP 메타데이터 XML |
| `GET` | `/api/auth/saml/login` | 공개 | SAML 로그인 시작 |
| `POST` | `/api/auth/saml/callback` | 공개 | SAML 어설션 컨슈머 서비스 |

사용자에 대해 MFA가 활성화되면 `POST /api/auth/login`는 세션 토큰 대신 `{"requiresMfa":true,"mfaToken":"...","mfaRequired":true|false}`를 반환합니다. 해당 `mfaToken`와 함께 TOTP 또는 복구 코드를 `/api/auth/mfa/complete`로 전송하세요.

### 권한 {#permissions}

| 권한 | 관리자 | 사용자 |
|-----------|:-----:|:----:|
| 도구 사용 | ✓ | ✓ |
| 본인 파일/파이프라인/API 키 | ✓ | ✓ |
| 전체 사용자의 파일/파이프라인/키 조회 | ✓ | - |
| 설정 쓰기 | ✓ | - |
| 사용자 및 팀 관리 | ✓ | - |
| 브랜딩 관리 | ✓ | - |

## 상태 확인 {#health-check}

| 메서드 | 경로 | 접근 권한 | 설명 |
|--------|------|--------|-------------|
| `GET` | `/api/v1/health` | 공개 | 기본 상태 확인. 200과 함께 `{"status":"healthy","version":"..."}`를 반환하거나, 데이터베이스에 연결할 수 없으면 503과 함께 `{"status":"unhealthy"}`을 반환합니다. |
| `GET` | `/api/v1/readyz` | 공개 | 준비 상태 프로브. PostgreSQL, Redis, 디스크 공간, 그리고 구성된 경우 S3를 확인합니다. 인스턴스가 트래픽을 받으면 안 되는 경우 503을 반환합니다. |
| `GET` | `/api/v1/admin/health` | 관리자(`system:health`) | 가동 시간, 스토리지 모드, 데이터베이스 상태, 큐 상태, GPU 가용성을 포함한 상세 진단. |

## 도구 사용 {#using-tools}

모든 도구는 동일한 패턴을 따릅니다:

```bash
# Single file
curl -X POST http://localhost:1349/api/v1/tools/<section>/<toolId> \
  -H "Authorization: Bearer <token>" \
  -F "file=@input.jpg" \
  -F 'settings={"width":800,"height":600}'

# Batch (returns ZIP)
curl -X POST http://localhost:1349/api/v1/tools/<section>/<toolId>/batch \
  -H "Authorization: Bearer <token>" \
  -F "files=@a.jpg" \
  -F "files=@b.jpg" \
  -F 'settings={...}'
```

`<section>`는 `image`, `video`, `audio`, `pdf`, `files` 중 하나입니다.

- 업로드는 `multipart/form-data`입니다.
- `settings`는 도구별 옵션을 담은 JSON 문자열입니다.
- `clientJobId`은 호출자가 제공하는 진행률 상관 관계를 위한 선택적 폼 필드입니다.
- `fileId`은 기존 파일 라이브러리 항목을 참조하는 선택적 폼 필드입니다. 이 값이 있으면 처리된 출력이 새 버전으로 저장되며 응답에 `savedFileId`가 포함됩니다.
- **빠른 도구**는 보통 200 JSON을 반환합니다: `{"jobId":"...","downloadUrl":"/api/v1/download/<jobId>/<filename>","originalSize":1234,"processedSize":567}`. 처리된 파일은 `downloadUrl`에서 가져오세요.
- **큐에 들어간 모든 도구**는 장시간 실행되거나 동기 대기 창을 초과하면 202 JSON을 반환할 수 있습니다: `{"jobId":"...","async":true}`. 진행률을 위해 SSE에 연결한 다음 완료되면 다운로드하세요([진행률 추적](#progress-tracking) 참고).
- **배치** 경로는 제네릭 배치 레지스트리에 등록된 도구의 경우 ZIP 아카이브를 직접 스트리밍하여(`X-Job-Id` 헤더 포함) 반환합니다.

## 도구 레퍼런스 {#tools-reference}

### 변환 프리셋 {#conversion-presets}

공유 카탈로그에는 `jpg-to-png`, `mov-to-mp4`, `m4a-to-mp3`, `pdf-to-jpg`, `excel-to-csv`과 같은 83개의 전용 변환 프리셋 엔드포인트가 포함되어 있습니다. 프리셋은 일급 도구 경로입니다:

`POST /api/v1/tools/<section>/<presetId>`

각 프리셋은 출력 형식을 고정하고 `convert`, `convert-video`, `extract-audio`, `convert-audio`, `image-to-pdf`, `pdf-to-image`, `svg-to-raster`, `convert-spreadsheet`과 같은 기본 도구에 위임합니다. 전체 경로 표와 선택적 설정은 [변환 프리셋](/ko/tools/conversion-presets)을 참고하세요.

### 필수 도구 {#essentials}

| 도구 ID | 이름 | 주요 설정 |
|---------|------|-------------|
| `resize` | 크기 조정 | `width`, `height`, `fit`(cover/contain/fill/inside/outside), `percentage`, `withoutEnlargement`, 그리고 23개의 소셜 미디어 프리셋 |
| `crop` | 자르기 | `left`, `top`, `width`, `height`, `unit`(px/percent) |
| `rotate` | 회전 및 뒤집기 | `angle`, `horizontal`(bool), `vertical`(bool) |
| `convert` | 변환 | `format`(jpg/png/webp/avif/tiff/gif/heic/heif), `quality` |
| `compress` | 압축 | `mode`(quality/targetSize), `quality`(1–100), `targetSizeKb` |

### 최적화 {#optimization}

| 도구 ID | 이름 | 주요 설정 |
|---------|------|-------------|
| `optimize-for-web` | 웹용 최적화 | `format`(webp/jpeg/avif/png), `quality`, `maxWidth`, `maxHeight`, `progressive`, `stripMetadata` |
| `strip-metadata` | 메타데이터 제거 | - |
| `edit-metadata` | 메타데이터 편집 | `title`, `description`, `author`, `copyright`, `keywords`, `gps`(lat/lon), `dateTime` |
| `bulk-rename` | 일괄 이름 변경 | `pattern`(`{n}`, `{date}`, `{original}` 지원), `startIndex`, `padding` |
| `image-to-pdf` | 이미지를 PDF로 | `pageSize`(A4/Letter/...), `orientation`, `margin`, `targetSize`({value, unit}) |
| `favicon` | 파비콘 생성기 | `padding`, `backgroundColor`, `borderRadius` - 모든 표준 크기를 생성합니다 |

### 조정 {#adjustments}

| 도구 ID | 이름 | 주요 설정 |
|---------|------|-------------|
| `adjust-colors` | 색상 조정 | `brightness`, `contrast`, `exposure`, `saturation`, `temperature`, `tint`, `hue`, `sharpness`, `red`, `green`, `blue`, `effect`(none/grayscale/sepia/invert) |
| `sharpening` | 선명하게 하기 | `method`(adaptive/unsharp-mask/high-pass), `sigma`, `m1`, `m2`, `x1`, `y2`, `y3`, `amount`, `radius`, `threshold`, `strength`, `kernelSize`(3/5), `denoise`(off/light/medium/strong) |
| `replace-color` | 색상 교체 | `sourceColor`, `targetColor`(교체 색상), `makeTransparent`, `tolerance` |
| `color-blindness` | 색맹 시뮬레이션 | `simulationType`(protanopia/deuteranopia/tritanopia/protanomaly/deuteranomaly/tritanomaly/achromatopsia/blueConeMonochromacy, 기본값 "deuteranomaly") |
| `duotone` | 듀오톤 | `shadow`(hex), `highlight`(hex), `intensity`(0-100) |
| `pixelate` | 픽셀화 | `blockSize`(2-128), `region`(부분 픽셀화를 위한 {left, top, width, height}) |
| `vignette` | 비네트 | `strength`(0.1-1), `color`(hex), `radius`, `softness`, `roundness`, `centerX`, `centerY` |

### AI 도구 {#ai-tools}

모든 AI 도구는 사용자의 하드웨어에서 실행됩니다: 기본적으로 CPU, 지원되는 NVIDIA GPU가 있는 경우 NVIDIA CUDA. VA-API, Quick Sync 또는 OpenCL을 통한 Intel/AMD iGPU 가속은 현재 AI 추론에 지원되지 않습니다. 인터넷 연결이 필요 없습니다.

| 도구 ID | 이름 | AI 모델 | 주요 설정 |
|---------|------|---------|-------------|
| `remove-background` | 배경 제거 | rembg(BiRefNet / U2-Net) | `model`, `backgroundType`(transparent/color/gradient/blur/image), `backgroundColor`, `gradientColor1`, `gradientColor2`, `gradientAngle`, `blurEnabled`, `blurIntensity`, `shadowEnabled`, `shadowOpacity` |
| `upscale` | 이미지 업스케일 | RealESRGAN | `scale`(2/4), `model`, `faceEnhance`, `denoise`, `format`, `quality` |
| `erase-object` | 오브젝트 지우개 | LaMa(ONNX) | 마스크는 두 번째 파일 파트로 전송(필드명 `mask`), `format`, `quality` |
| `ocr` | OCR / 텍스트 추출 | Tesseract(빠름); RapidOCR + PP-OCR ONNX(균형 잡힌/최고) | `quality`(빠름/균형/최고), `language`, `enhance` |
| `blur-faces` | 얼굴 / PII 블러 | MediaPipe | `blurRadius`, `sensitivity` |
| `smart-crop` | 스마트 자르기 | MediaPipe + Sharp | `mode`(subject/face/trim), `strategy`(attention/entropy), `width`, `height`, `padding`, `facePreset`(closeup/head-shoulders/upper-body/half-body), `sensitivity`, `threshold`, `padToSquare`, `padColor`, `targetSize`, `quality` |
| `image-enhancement` | 이미지 향상 | 분석 기반 | `mode`(auto/exposure/contrast/color/sharpness), `strength` |
| `enhance-faces` | 얼굴 향상 | GFPGAN / CodeFormer | `model`(gfpgan/codeformer), `strength`, `sensitivity`, `centerFace` |
| `colorize` | AI 색상화 | DDColor | `intensity`, `model` |
| `noise-removal` | 노이즈 제거 | 계층형 노이즈 제거 | `tier`(quick/balanced/quality/maximum), `strength`, `detailPreservation`, `colorNoise`, `format`, `quality` |
| `red-eye-removal` | 적목 제거 | 얼굴 랜드마크 + 색상 분석 | `sensitivity`, `strength` |
| `restore-photo` | 사진 복원 | 다단계 파이프라인 | `mode`(auto/light/heavy), `scratchRemoval`, `faceEnhancement`, `fidelity`, `denoise`, `denoiseStrength`, `colorize` |
| `passport-photo` | 여권 사진 | MediaPipe 랜드마크 | 2단계 플로우. 분석은 멀티파트 `file`을 사용하고, 생성은 `countryCode`, `bgColor`, `printLayout`(none/4x6/a4), 랜드마크, 이미지 크기를 담은 JSON을 사용합니다 |
| `content-aware-resize` | 콘텐츠 인식 크기 조정 | 심 카빙(caire) | `width`, `height`, `protectFaces`, `blurRadius`, `sobelThreshold`, `square` |
| `transparency-fixer` | PNG 투명도 수정기 | BiRefNet HR-매팅 | `defringe`(0-100), `outputFormat`(png/webp) |
| `background-replace` | 배경 교체 | rembg(BiRefNet) | `backgroundType`(color/gradient), `color`(hex), `gradientColor1`, `gradientColor2`, `gradientAngle`, `feather`(0-20), `format`(png/webp) |
| `blur-background` | 배경 블러 | rembg(BiRefNet) | `intensity`(1-100), `feather`(0-20), `format`(png/webp) |
| `ai-canvas-expand` | AI 캔버스 확장 | LaMa(아웃페인팅) | `extendTop`, `extendRight`, `extendBottom`, `extendLeft`(px), `tier`(fast/balanced/high), `format`, `quality` |

### 워터마크 및 오버레이 {#watermark-overlay}

| 도구 ID | 이름 | 주요 설정 |
|---------|------|-------------|
| `watermark-text` | 텍스트 워터마크 | `text`, `font`, `fontSize`, `color`, `opacity`, `position`, `rotation`, `tile` |
| `watermark-image` | 이미지 워터마크 | `opacity`, `position`, `scale` - 두 번째 파일이 워터마크입니다 |
| `text-overlay` | 텍스트 오버레이 | `text`, `font`, `fontSize`, `color`, `x`, `y`, `background`, `padding`, `borderRadius` |
| `compose` | 이미지 합성 | `x`, `y`, `opacity`, `blend` - 두 번째 파일이 위에 레이어링됩니다 |
| `meme-generator` | 밈 생성기 | `templateId`, `textLayout`(top-bottom/top-only/bottom-only/center/side-by-side), `textBoxes`([{id, text}]), `fontFamily`(anton/arial-black/comic-sans/montserrat/bebas-neue/permanent-marker/roboto), `fontSize`, `textColor`, `strokeColor`, `textAlign`, `allCaps`. 템플릿 모드(`templateId`를 담은 JSON 본문) 또는 커스텀 이미지 모드(파일을 담은 멀티파트)를 지원합니다. |

### 유틸리티 {#utilities}

| 도구 ID | 이름 | 주요 설정 |
|---------|------|-------------|
| `info` | 이미지 정보 | - (너비, 높이, 형식, 크기, 채널, hasAlpha, DPI, EXIF 반환) |
| `compare` | 이미지 비교 | `mode`(side-by-side/overlay/diff), `diffThreshold` - 두 번째 파일이 비교 대상입니다 |
| `find-duplicates` | 중복 찾기 | `threshold`(지각적 해시 거리, 기본값 8) - 다중 파일 |
| `color-palette` | 색상 팔레트 | `count`(주요 색상 개수), `format`(hex/rgb) |
| `qr-generate` | QR 코드 생성기 | `data`, `size`, `margin`, `colorDark`, `colorLight`, `errorCorrectionLevel`, `dotStyle`, `cornerStyle`, `logo`(선택적 파일) |
| `barcode-read` | 바코드 리더 | - (QR, EAN, Code128, DataMatrix 등을 자동 감지) |
| `image-to-base64` | 이미지를 Base64로 | `format`(data-uri/plain), `mimeType` |
| `html-to-image` | HTML을 이미지로 | `url`, `format`(png/jpg/webp), `quality`, `fullPage`, `devicePreset`(desktop/tablet/mobile/custom), `viewportWidth`, `viewportHeight` |
| `histogram` | 히스토그램 | `scale`(linear/log) - RGB 히스토그램 차트 + 채널별 통계 반환 |
| `lqip-placeholder` | LQIP 플레이스홀더 | `width`(4-64), `blur`, `strategy`(blur/pixelate/solid), `format`(webp/png/jpeg), `quality` |
| `barcode-generate` | 바코드 생성기 | `text`, `type`(code128/ean13/upca/code39/itf14/datamatrix), `scale`(1-8), `includeText`(bool). JSON 본문, 파일 업로드 없음. |

### 레이아웃 및 합성 {#layout-composition}

| 도구 ID | 이름 | 주요 설정 |
|---------|------|-------------|
| `collage` | 콜라주 / 그리드 | `template`(25개 이상의 레이아웃), `gap`, `backgroundColor`, `borderRadius` - 다중 파일 |
| `stitch` | 이어붙이기 / 결합 | `direction`(horizontal/vertical/grid), `gap`, `backgroundColor`, `alignment` - 다중 파일 |
| `split` | 이미지 분할 | `mode`(grid/rows/cols), `rows`, `cols`, `tileWidth`, `tileHeight` |
| `border` | 테두리 및 프레임 | `width`, `color`, `style`(solid/gradient/pattern), `borderRadius`, `padding`, `shadow` |
| `beautify` | 스크린샷 꾸미기 | `backgroundType`(solid/linear-gradient/radial-gradient/image/transparent), `gradientStops`, `padding`, `borderRadius`, `shadowPreset`, `frame`(none/macos-light/macos-dark/windows-light/windows-dark/browser-light/browser-dark/iphone/macbook/ipad/...), `socialPreset`(none/twitter/linkedin/instagram-square/instagram-story/facebook/producthunt), `watermarkText`, `outputFormat` |
| `circle-crop` | 원형 자르기 | `zoom`(1-5), `offsetX`, `offsetY`, `borderWidth`, `borderColor`, `background`(transparent/hex), `outputSize` |
| `image-pad` | 이미지 패딩 | `target`(16:9/9:16/1:1/4:3/3:4/custom), `ratioW`, `ratioH`, `background`(color/transparent/blur), `color`(hex), `padding`(0-50%) |
| `sprite-sheet` | 스프라이트 시트 | `columns`(1-16), `padding`, `background`(hex), `format`(png/webp/jpeg), `quality` - 다중 파일(2-64개 이미지) |

### 형식 및 변환 {#format-conversion}

| 도구 ID | 이름 | 주요 설정 |
|---------|------|-------------|
| `svg-to-raster` | SVG를 래스터로 | `format`(png/jpeg/webp/avif/tiff/gif/heif), `width`, `height`, `scale`, `dpi`, `background` |
| `vectorize` | 이미지를 SVG로 | `colorMode`(bw/color), `threshold`, `colorPrecision`, `filterSpeckle`, `pathMode`(none/polygon/spline) |
| `gif-tools` | GIF 도구 | `action`(resize/optimize/reverse/speed/extract-frames/rotate/add-text), 액션별 매개변수 |
| `gif-webp` | GIF/WebP 변환기 | `quality`(1-100), `lossless`(bool), `resizePercent`(10-100) |

### 비디오 도구 {#video-tools}

| 도구 ID | 이름 | 주요 설정 |
|---------|------|-------------|
| `convert-video` | 비디오 변환 | `format`(mp4/mov/webm/avi/mkv), `quality`(high/balanced/small) |
| `compress-video` | 비디오 압축 | `quality`(light/balanced/strong), `resolution`(original/1080p/720p/480p) |
| `trim-video` | 비디오 자르기 | `startS`, `endS`, `precise`(bool, 프레임 단위 정밀 컷) |
| `mute-video` | 비디오 음소거 | - |
| `video-to-gif` | 비디오를 GIF로 | `fps`(1-30), `width`, `startS`, `durationS`(최대 60초) |
| `resize-video` | 비디오 크기 조정 | `width`, `height`, `preset`(custom/2160p/1440p/1080p/720p/480p/360p) |
| `crop-video` | 비디오 자르기(크롭) | `width`, `height`, `x`, `y` |
| `rotate-video` | 비디오 회전 | `transform`(cw90/ccw90/180/hflip/vflip) |
| `change-fps` | FPS 변경 | `fps`(1-120) |
| `video-color` | 비디오 색상 | `brightness`, `contrast`, `saturation`, `gamma` |
| `video-speed` | 비디오 속도 | `factor`(0.25-4), `keepPitch`(bool) |
| `reverse-video` | 비디오 역재생 | - (최대 5분) |
| `video-loudnorm` | 오디오 정규화 | - (EBU R128) |
| `aspect-pad` | 화면비 패딩 | `target`(16:9/9:16/1:1/4:3/3:4), `color`(hex) |
| `blur-pad` | 블러 패딩 | `target`(16:9/9:16/1:1/4:3/3:4), `blur`(2-50) |
| `watermark-video` | 비디오 워터마크 | `text`, `position`, `fontSize`, `opacity`, `color` |
| `stabilize-video` | 비디오 안정화 | `smoothing`(5-60, 프레임 단위) |
| `gif-to-video` | GIF를 비디오로 | `format`(mp4/webm/mov) |
| `video-to-webp` | 비디오를 WebP로 | `fps`, `width`, `quality`, `loop`(bool) |
| `video-to-frames` | 비디오를 프레임으로 | `mode`(all/nth/timestamps), `n`, `timestamps`, `format`(png/jpg) |
| `merge-videos` | 비디오 병합 | - (다중 파일, 첫 번째 비디오의 해상도로 정규화됨) |
| `replace-audio` | 오디오 교체 | - (비디오 + 오디오 파일, 두 개 파일) |
| `burn-subtitles` | 자막 굽기 | `fontSize`(8-72) - 비디오 + 자막 파일 |
| `embed-subtitles` | 자막 임베드 | `language`(ISO 639-2/B 코드) - 비디오 + 자막 파일 |
| `extract-subtitles` | 자막 추출 | - (SRT 출력) |
| `images-to-video` | 이미지를 비디오로 | `secondsPerImage`(0.5-10), `resolution`(1080p/720p/square), `fps` - 다중 파일 |
| `video-metadata` | 비디오 메타데이터 정리 | - |
| `auto-subtitles` | 자동 자막(AI) | `language`(auto/en/de/fr/es/zh/ja/ko/id/th/vi), `format`(srt/vtt) |
| `extract-audio` | 오디오 추출 | `format`(mp3/wav/m4a/ogg) |

### 오디오 도구 {#audio-tools}

| 도구 ID | 이름 | 주요 설정 |
|---------|------|-------------|
| `convert-audio` | 오디오 변환 | `format`(mp3/wav/ogg/flac/m4a), `bitrateKbps`(32-320) |
| `trim-audio` | 오디오 자르기 | `startS`, `endS` |
| `volume-adjust` | 볼륨 조정 | `gainDb`(-30 ~ 30) |
| `normalize-audio` | 오디오 정규화 | - (EBU R128, -16 LUFS) |
| `fade-audio` | 오디오 페이드 | `fadeInS`(0-30), `fadeOutS`(0-30) |
| `reverse-audio` | 오디오 역재생 | - |
| `audio-speed` | 오디오 속도 | `factor`(0.25-4) |
| `pitch-shift` | 피치 시프트 | `semitones`(-12 ~ 12) |
| `audio-channels` | 오디오 채널 | `mode`(stereo-to-mono/mono-to-stereo/swap) |
| `silence-removal` | 무음 제거 | `thresholdDb`(-80 ~ -20), `minSilenceS`(0.1-5) |
| `noise-reduction` | 노이즈 감소 | `strength`(light/medium/strong) |
| `merge-audio` | 오디오 병합 | `format`(mp3/wav/flac/m4a) - 다중 파일 |
| `split-audio` | 오디오 분할 | `mode`(time/parts/silence), `segmentS`, `parts`, `thresholdDb`, `minSilenceS` |
| `ringtone-maker` | 벨소리 제작기 | `startS`, `durationS`(1-30) |
| `waveform-image` | 파형 이미지 | `width`, `height`, `color`(hex) |
| `audio-metadata` | 오디오 메타데이터 | `strip`(bool), `title`, `artist`, `album` |
| `transcribe-audio` | 오디오 전사(AI) | `language`(auto/en/de/fr/es/zh/ja/ko/id/th/vi), `outputFormat`(txt/srt/vtt) |

### 문서 도구 {#document-tools}

| 도구 ID | 이름 | 주요 설정 |
|---------|------|-------------|
| `merge-pdf` | PDF 병합 | - (다중 파일, 최대 20개 PDF) |
| `split-pdf` | PDF 분할 | `mode`(range/every), `range`, `everyN`(1-500) |
| `compress-pdf` | PDF 압축 | `mode`(quality/targetSize), `quality`(1-100), `targetSizeKb` |
| `rotate-pdf` | PDF 회전 | `angle`(90/180/270), `range`(페이지 범위) |
| `extract-pages` | 페이지 추출 | `range`(qpdf 구문, 예: "1-5,8,10-z") |
| `remove-pages` | 페이지 제거 | `pages`(제거할 qpdf 범위) |
| `organize-pdf` | PDF 정리 | `order`(qpdf 페이지 순서, 예: "3,1,2,5-z") |
| `protect-pdf` | PDF 보호 | `userPassword`, `ownerPassword`(AES-256) |
| `unlock-pdf` | PDF 잠금 해제 | `password` |
| `repair-pdf` | PDF 복구 | - |
| `linearize-pdf` | PDF 웹 최적화 | - (빠른 웹 뷰잉을 위한 선형화) |
| `grayscale-pdf` | PDF 흑백화 | - |
| `pdfa-convert` | PDF/A 변환 | - (보존용 PDF/A-2) |
| `crop-pdf` | PDF 자르기 | `margin`(0-2000 포인트) |
| `nup-pdf` | N-up PDF | `perSheet`(2/3/4/8/9/12/16) |
| `booklet-pdf` | 소책자 PDF | `perSheet`(2/4/6/8) |
| `watermark-pdf` | PDF 워터마크 | `text`, `position`, `fontSize`, `opacity`, `rotation` |
| `pdf-page-numbers` | PDF 페이지 번호 | `position`(bl/bc/br/tl/tc/tr), `fontSize` |
| `flatten-pdf` | PDF 병합(플래튼) | - (양식과 주석을 굽습니다) |
| `redact-pdf` | PDF 검정 처리 | `terms`(string[]), `caseSensitive`(bool) |
| `sign-pdf` | PDF 서명 | PDF `file`, 서명 파일 `sig0`, `sig1`, `placements` JSON 배열을 사용하는 커스텀 멀티파트 경로 |
| `pdf-to-text` | PDF를 텍스트로 | - |
| `pdf-to-word` | PDF를 Word로 | - |
| `pdf-metadata` | PDF 메타데이터 | `title`, `author`, `subject`, `keywords` |
| `convert-document` | 문서 변환 | `format`(docx/odt/rtf/txt) |
| `convert-presentation` | 프레젠테이션 변환 | `format`(pptx/odp) |
| `convert-spreadsheet` | 스프레드시트 변환 | `format`(xlsx/ods/csv) |
| `excel-to-pdf` | Excel을 PDF로 | - |
| `word-to-pdf` | Word를 PDF로 | - |
| `powerpoint-to-pdf` | PowerPoint를 PDF로 | - |
| `html-to-pdf` | HTML을 PDF로 | - (원격 리소스 비활성화) |
| `markdown-to-docx` | Markdown을 Word로 | - |
| `markdown-to-html` | Markdown을 HTML로 | - |
| `markdown-to-pdf` | Markdown을 PDF로 | - (원격 리소스 비활성화) |
| `epub-convert` | EPUB 변환 | `format`(pdf/docx/html/md) |
| `to-epub` | EPUB으로 변환 | - (.docx, .md, .html, .txt 허용) |
| `ocr-pdf` | PDF OCR(AI) | `quality`(fast/balanced/best), `language`(auto/en/de/fr/es/zh/ja/ko), `pages` |
| `pdf-to-image` | PDF를 이미지로 | `pages`(all/range), `format`, `dpi`, `quality` |
| `pdf-to-jpg` | PDF를 JPG로 | `pages`, `dpi`, `quality`, `colorMode` |
| `pdf-to-png` | PDF를 PNG로 | `pages`, `dpi`, `quality`, `colorMode` |
| `pdf-to-tiff` | PDF를 TIFF로 | `pages`, `dpi`, `quality`, `colorMode` |

### 파일 도구 {#file-tools}

| 도구 ID | 이름 | 주요 설정 |
|---------|------|-------------|
| `chart-maker` | 차트 제작기 | `kind`(bar/line/pie), `title`, `width`, `height` |
| `csv-excel` | CSV를 Excel로 | `sheet`(XLSX 입력용 워크시트 번호) - 양방향 |
| `csv-json` | CSV를 JSON으로 | `pretty`(bool) - 양방향 |
| `json-xml` | JSON을 XML로 | `pretty`(bool) - 양방향 |
| `split-csv` | CSV 분할 | `rowsPerFile`(1-1000000), `keepHeader`(bool) |
| `merge-csvs` | CSV 병합 | - (다중 파일, 일치하는 열) |
| `yaml-json` | YAML / JSON | - (양방향) |
| `xml-to-csv` | XML을 CSV로 | - (반복 요소 자동 탐지) |
| `excel-to-csv` | Excel을 CSV로 | `convert-spreadsheet`로 지원되는 전용 변환 프리셋 |
| `create-zip` | ZIP 생성 | - (다중 파일, 2-50개 파일) |
| `extract-zip` | ZIP 추출 | - (봄 보호) |

### HTML을 이미지로 {#html-to-image}

웹페이지를 이미지로 캡처합니다. 다른 도구와 달리 이 엔드포인트는 멀티파트 폼 데이터 대신 `application/json`를 허용합니다(파일 업로드 불필요).

**엔드포인트:** `POST /api/v1/tools/image/html-to-image`

**Content-Type:** `application/json`

| 매개변수 | 유형 | 기본값 | 설명 |
|-----------|------|---------|-------------|
| `url` | string | (필수) | 캡처할 URL(http/https만) |
| `format` | string | `"png"` | 출력 형식: `jpg`, `png`, `webp` |
| `quality` | number | `90` | 품질 1-100(JPG/WebP만) |
| `fullPage` | boolean | `false` | 전체 스크롤 페이지 캡처 |
| `devicePreset` | string | `"desktop"` | `desktop`, `tablet`, `mobile`, `custom` |
| `viewportWidth` | number | `1280` | 커스텀 뷰포트 너비 320-3840 |
| `viewportHeight` | number | `720` | 커스텀 뷰포트 높이 320-2160 |

**예시:**

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/html-to-image \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://snapotter.com", "format": "png", "devicePreset": "desktop"}'
```

**응답:**

```json
{
  "jobId": "uuid",
  "downloadUrl": "/api/v1/download/{jobId}/screenshot.png",
  "originalSize": 0,
  "processedSize": 54321
}
```

### 도구 하위 경로 {#tool-sub-routes}

일부 도구는 표준 `POST /api/v1/tools/<section>/<toolId>` 외에 추가 엔드포인트를 노출합니다:

| 메서드 | 경로 | 설명 |
|--------|------|-------------|
| `GET` | `/api/v1/tools/popular` | 인기 도구 ID를 반환하며, 사용 데이터가 부족할 때 큐레이션된 기본 목록으로 대체 |
| `POST` | `/api/v1/tools/image/remove-background/effects` | AI 재실행 없이 배경 효과(color/gradient/blur/shadow) 적용. 초기 제거에서 캐시된 마스크를 사용합니다. |
| `POST` | `/api/v1/tools/image/edit-metadata/inspect` | 이미지에서 기존 EXIF/IPTC/XMP 메타데이터 읽기 |
| `POST` | `/api/v1/tools/image/strip-metadata/inspect` | 제거 전 메타데이터 필드 확인 |
| `POST` | `/api/v1/tools/image/passport-photo/analyze` | 1단계: AI 얼굴 감지 + 배경 제거. 얼굴 랜드마크와 캐시된 데이터를 반환합니다. |
| `POST` | `/api/v1/tools/image/passport-photo/generate` | 2단계: 캐시된 분석을 사용해 자르기, 크기 조정, 타일링. AI 재실행 없음. |
| `POST` | `/api/v1/tools/image/gif-tools/info` | GIF 메타데이터 획득(프레임 수, 크기, 재생 시간) |
| `POST` | `/api/v1/tools/pdf/pdf-to-image/info` | PDF 메타데이터 획득(페이지 수, 크기) |
| `POST` | `/api/v1/tools/pdf/pdf-to-image/preview` | 특정 PDF 페이지의 미리보기 생성 |
| `POST` | `/api/v1/tools/pdf/pdf-to-jpg/info` | 전용 JPG 프리셋용 PDF 메타데이터 획득 |
| `POST` | `/api/v1/tools/pdf/pdf-to-jpg/preview` | JPG 프리셋 PDF 페이지 미리보기 생성 |
| `POST` | `/api/v1/tools/pdf/pdf-to-png/info` | 전용 PNG 프리셋용 PDF 메타데이터 획득 |
| `POST` | `/api/v1/tools/pdf/pdf-to-png/preview` | PNG 프리셋 PDF 페이지 미리보기 생성 |
| `POST` | `/api/v1/tools/pdf/pdf-to-tiff/info` | 전용 TIFF 프리셋용 PDF 메타데이터 획득 |
| `POST` | `/api/v1/tools/pdf/pdf-to-tiff/preview` | TIFF 프리셋 PDF 페이지 미리보기 생성 |
| `POST` | `/api/v1/tools/image/svg-to-raster/batch` | 여러 SVG를 래스터로 일괄 변환 |
| `POST` | `/api/v1/tools/image/image-enhancement/analyze` | 이미지 품질 분석 및 향상 권장 사항 반환 |
| `POST` | `/api/v1/tools/image/optimize-for-web/preview` | 실시간 매개변수 조정을 위한 경량 미리보기. 크기 헤더가 포함된 최적화된 이미지를 반환합니다. |

## 배치 처리 {#batch-processing}

제네릭 배치 지원 도구를 여러 파일에 한 번에 적용합니다. ZIP 아카이브를 반환합니다. PDF 서명 및 PDF를 이미지로 변환하는 프리셋 경로와 같은 커스텀 다중 파일 또는 다단계 경로는 제네릭 `/batch` 경로 대신 자체 엔드포인트 계약을 사용합니다.

`ocr-pdf` 도구는 이 제네릭 `/batch` 경로를 지원합니다.

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress/batch \
  -H "Authorization: Bearer <token>" \
  -F "files=@a.jpg" \
  -F "files=@b.jpg" \
  -F "files=@c.jpg" \
  -F 'settings={"quality":80}'
```

동시성은 `CONCURRENT_JOBS`로 제어됩니다(기본값: CPU 코어에서 자동 감지). `MAX_BATCH_SIZE`은 배치당 파일 수를 제한합니다(기본값: 100; 무제한은 0으로 설정).

## 파이프라인 {#pipelines}

### 파이프라인 실행 {#execute-a-pipeline}

```bash
# Single file
curl -X POST http://localhost:1349/api/v1/pipeline/execute \
  -H "Authorization: Bearer <token>" \
  -F "file=@input.jpg" \
  -F 'pipeline={"steps":[
    {"toolId":"resize","settings":{"width":1200}},
    {"toolId":"compress","settings":{"quality":80}},
    {"toolId":"watermark-text","settings":{"text":"© 2025"}}
  ]}'

# Batch (multiple files → ZIP)
curl -X POST http://localhost:1349/api/v1/pipeline/batch \
  -H "Authorization: Bearer <token>" \
  -F "files=@a.jpg" \
  -F "files=@b.jpg" \
  -F 'pipeline={"steps":[{"toolId":"resize","settings":{"width":800}}]}'
```

각 단계의 출력은 다음 단계의 입력이 됩니다. 파이프라인은 기본적으로 20단계를 허용하며 `MAX_PIPELINE_STEPS`로 구성할 수 있습니다. `MAX_PIPELINE_STEPS=0`로 설정하면 제한이 제거됩니다.

### 파이프라인 저장 및 관리 {#save-and-manage-pipelines}

| 메서드 | 경로 | 설명 |
|--------|------|-------------|
| `POST` | `/api/v1/pipeline/save` | 이름이 지정된 파이프라인 저장(`name`, `description`, `steps[]`) |
| `GET` | `/api/v1/pipeline/list` | 저장된 파이프라인 목록(관리자는 전체, 사용자는 본인 것 조회) |
| `DELETE` | `/api/v1/pipeline/:id` | 삭제(소유자 또는 관리자) |
| `GET` | `/api/v1/pipeline/tools` | 파이프라인 단계에 유효한 도구 ID 목록 |

## 진행률 추적 {#progress-tracking}

장시간 실행 작업, 큐에 들어간 도구, 배치 작업, 파이프라인은 Server-Sent Events를 통해 실시간 진행률을 발행합니다. 진행률 스트림은 공개이며 작업 ID로 키가 지정되므로 클라이언트가 이를 읽는 데 Authorization 헤더를 보낼 필요가 없습니다.

```bash
# Connect to the SSE stream (jobId is in the JSON response body from the tool endpoint)
curl -N http://localhost:1349/api/v1/jobs/<jobId>/progress
```

이벤트 형식:
```
data: {"jobId":"...","type":"single","phase":"processing","stage":"Upscaling","percent":42}
data: {"jobId":"...","type":"single","phase":"complete","percent":100,"result":{"downloadUrl":"/api/v1/download/..."}}
data: {"jobId":"...","type":"batch","status":"processing","completedFiles":2,"totalFiles":5,"failedFiles":0,"errors":[]}
```

`POST /api/v1/jobs/:jobId/cancel`로 큐에 들어갔거나 실행 중인 작업의 취소를 요청할 수 있습니다. 응답은 `{"canceled":true|false}`입니다.

## 파일 라이브러리 {#file-library}

버전 이력이 있는 영구 파일 저장소.

| 메서드 | 경로 | 설명 |
|--------|------|-------------|
| `POST` | `/api/v1/upload` | 워크스페이스에 파일 업로드(임시 처리) |
| `POST` | `/api/v1/files/upload` | 영구 파일 라이브러리에 파일 업로드 |
| `POST` | `/api/v1/files/save-result` | 도구 처리 결과를 새 파일 버전으로 저장 |
| `GET` | `/api/v1/files` | 저장된 파일 목록(페이지 처리, 검색 포함) |
| `GET` | `/api/v1/files/:id` | 파일 메타데이터 + 버전 체인 획득 |
| `GET` | `/api/v1/files/:id/download` | 파일 다운로드 |
| `GET` | `/api/v1/files/:id/thumbnail` | 300px JPEG 썸네일 획득 |
| `DELETE` | `/api/v1/files` | 파일 및 버전 체인 일괄 삭제(본문: `{ ids: [...] }`) |
| `POST` | `/api/v1/fetch-urls` | URL 기반 가져오기를 위해 원격 URL을 워크스페이스로 페치 |
| `POST` | `/api/v1/preview` | 브라우저 호환 WebP 미리보기 생성(HEIC/HEIF/RAW 형식용) |
| `GET` | `/api/v1/files/:id/preview` | 저장된 PDF, 오피스 문서, 비디오 또는 오디오 파일에 대해 캐시되었거나 생성된 브라우저 호환 미리보기 스트리밍 |
| `POST` | `/api/v1/preview/generate` | 업로드된 미디어 파일을 먼저 저장하지 않고 온디맨드 MP4 또는 MP3 미리보기 생성 |
| `GET` | `/api/v1/download/:jobId/:filename` | 워크스페이스에서 처리된 파일 다운로드 |

도구 결과를 라이브러리에 자동 저장하려면 기존 라이브러리 파일을 참조하는 `fileId`을 멀티파트 폼 필드로 포함하세요. 처리된 결과가 새 버전으로 저장됩니다.

## API 키 관리 {#api-key-management}

| 메서드 | 경로 | 접근 권한 | 설명 |
|--------|------|--------|-------------|
| `POST` | `/api/v1/api-keys` | 인증 | 새 키 생성 - 한 번만 표시됨 |
| `GET` | `/api/v1/api-keys` | 인증 | 키 목록(name, id, lastUsedAt - 원본 키 아님) |
| `DELETE` | `/api/v1/api-keys/:id` | 인증 | 키 삭제 |

## 팀 {#teams}

| 메서드 | 경로 | 접근 권한 | 설명 |
|--------|------|--------|-------------|
| `GET` | `/api/v1/teams` | 관리자(`teams:manage`) | 팀 목록 |
| `POST` | `/api/v1/teams` | 관리자(`teams:manage`) | 팀 생성 |
| `PUT` | `/api/v1/teams/:id` | 관리자(`teams:manage`) | 팀 이름 변경 |
| `DELETE` | `/api/v1/teams/:id` | 관리자(`teams:manage`) | 팀 삭제(기본 팀 또는 멤버가 있는 팀은 삭제 불가) |

## 설정 {#settings}

런타임 구성은 인식된 키의 닫힌 집합을 사용합니다. 읽기에는 `settings:read`, 쓰기에는 `settings:write`가 필요하며, 보안 및 규정 준수 키에는 각각 `security:manage` 또는 `compliance:manage`도 필요합니다. 비밀 설정에는 전체 관리자 권한이 필요하고, 전용 엔드포인트가 관리하는 자격 증명과 상태는 여기서 읽기 전용입니다. 일괄 업데이트는 값을 쓰기 전에 검증됩니다.

| 메서드 | 경로 | 설명 |
|--------|------|-------------|
| `GET` | `/api/v1/settings` | 모든 설정 획득 |
| `PUT` | `/api/v1/settings` | 설정 일괄 업데이트(키-값 쌍을 담은 JSON 본문) |
| `GET` | `/api/v1/settings/:key` | 키로 특정 설정 획득 |

대표 키: `disabledTools`(도구 ID의 JSON 배열), `enableExperimentalTools`(불리언), `loginAttemptLimit`(보안 정책), `auditRetentionDays`(규정 준수 정책). 알 수 없는 키는 거부됩니다.

## 환경설정 {#preferences}

사용자별 환경설정은 인스턴스 설정과 별개입니다. 인증된 모든 사용자는 자신의 환경설정 맵을 읽고 업데이트할 수 있습니다.

| 메서드 | 경로 | 설명 |
|--------|------|-------------|
| `GET` | `/api/v1/preferences` | 현재 사용자의 환경설정을 `{ "preferences": { ... } }`로 획득 |
| `PUT` | `/api/v1/preferences` | 현재 사용자에 대해 하나 이상의 환경설정 키를 업서트 |

## 역할 {#roles}

세분화된 권한을 가진 커스텀 역할 관리.

| 메서드 | 경로 | 접근 권한 | 설명 |
|--------|------|--------|-------------|
| `GET` | `/api/v1/roles` | 관리자(`audit:read`) | 사용자 수와 함께 모든 역할 목록 |
| `POST` | `/api/v1/roles` | 관리자(`security:manage`) | 커스텀 역할 생성(`name`, `description`, `permissions`) |
| `PUT` | `/api/v1/roles/:id` | 관리자(`security:manage`) | 커스텀 역할 업데이트(기본 제공 역할은 수정 불가) |
| `DELETE` | `/api/v1/roles/:id` | 관리자(`security:manage`) | 커스텀 역할 삭제(기본 제공 역할은 삭제 불가; 영향을 받는 사용자는 `user` 역할로 되돌아감) |

사용 가능한 권한(17개): `tools:use`, `files:own`, `files:all`, `apikeys:own`, `apikeys:all`, `pipelines:own`, `pipelines:all`, `settings:read`, `settings:write`, `users:manage`, `teams:manage`, `features:manage`, `system:health`, `audit:read`, `compliance:manage`, `webhooks:manage`, `security:manage`.

## 감사 로그 {#audit-log}

보안 관련 작업을 검토하기 위한 관리자 전용 엔드포인트.

| 메서드 | 경로 | 접근 권한 | 설명 |
|--------|------|--------|-------------|
| `GET` | `/api/v1/audit-log` | 관리자(`audit:read`) | 선택적 필터가 있는 페이지 처리된 감사 로그 |

쿼리 매개변수:

| 매개변수 | 설명 |
|-----------|-------------|
| `page` | 페이지 번호(기본값: 1) |
| `limit` | 페이지당 항목 수(기본값: 50, 최대: 100) |
| `action` | 액션 유형으로 필터링(예: `ROLE_CREATED`, `ROLE_DELETED`) |
| `ip` | 소스 IP 주소로 필터링 |
| `from` | 이 ISO 8601 날짜 이후의 항목 필터링 |
| `to` | 이 ISO 8601 날짜 이전의 항목 필터링 |

## 분석 {#analytics}

| 메서드 | 경로 | 접근 권한 | 설명 |
|--------|------|--------|-------------|
| `GET` | `/api/v1/config/analytics` | 공개 | 유효한 분석 구성 획득(PostHog 키, Sentry DSN, 샘플 레이트). 컴파일 타임 베이크 또는 인스턴스 `analyticsEnabled` 설정으로 인해 분석이 꺼져 있으면 키, DSN, 인스턴스 ID는 비어 있습니다. |
| `POST` | `/api/v1/feedback` | 인증 | 명시적 사용자 피드백을 구성된 PostHog 프로젝트에 `feedback_submitted`로 제출. 이 경로는 분석 게이트를 준수하고, 제출 속도를 제한하며, `contactOk`이 true가 아닌 한 연락처 필드를 제거하고, 파일 내용, 파일 이름, 업로드 경로 또는 원본 비공개 오류 텍스트를 절대 받지 않습니다. 분석이 비활성화되면 `{ "ok": true, "accepted": false }`를 반환합니다. |
| `PUT` | `/api/v1/settings` | 관리자(`settings:write`) | 인스턴스 전체 옵트아웃 설정. 모두에 대해 분석을 끄려면 JSON 본문 `{ "analyticsEnabled": "false" }`을, 다시 켜려면 `"true"`를 보냅니다. |

## 기능 / AI 번들 {#features-ai-bundles}

AI 기능 번들 관리(Docker 환경에서 AI 모델 패키지 설치/제거). 커스텀 자동화에서 도구를 활성화할 때는 도구 수준 설치 엔드포인트를 선호하세요: 일부 AI 도구는 둘 이상의 공유 번들이 필요하며, 이 엔드포인트는 이미 설치된 번들을 건너뛰고 누락된 번들만 큐에 넣습니다.

OCR 는 하드 종속성이 아닌 선택적 향상 기능입니다. `fast` Tesseract 계층은 팩 없이 작동합니다. `POST /api/v1/admin/features/ocr/install`는 `balanced` 및 `best`에 대해 서명된 RapidOCR 팩을 Linux amd64 또는 arm64 에 설치합니다. 정확한 OCR 런타임은 CPU 전용 및 NVIDIA 호스트에서 CPU 를 사용하며 최소 4 GiB 의 유효 메모리(구성된 컨테이너 cgroup 제한, 그렇지 않으면 호스트 메모리)가 필요합니다. SnapOtter 는 `requiredMemoryBytes`, `effectiveMemoryBytes` 및 `insufficient-memory` 호환성 이유를 보고하고 다운로드하기 전에 호환되지 않는 설치를 거부합니다. 이 메모리 요구 사항은 `fast`에는 적용되지 않습니다. 팩은 대상에 따라 약 208-234 MiB 를 다운로드하고 409-488 MiB 를 설치합니다. 서명된 인덱스는 설치 중에 적용된 정확한 크기를 바인딩합니다.

| 메서드 | 경로 | 접근 권한 | 설명 |
|--------|------|--------|-------------|
| `GET` | `/api/v1/features` | 인증 | 모든 기능 번들과 설치 상태 목록 |
| `POST` | `/api/v1/admin/features/:bundleId/install` | 관리자(`features:manage`) | 기능 번들 설치(비동기, 진행률 추적을 위해 `jobId` 반환) |
| `POST` | `/api/v1/admin/tools/:toolId/features/install` | 관리자(`features:manage`) | 도구에 필요한 모든 번들 설치; 번들별 큐잉/건너뜀 상태 반환 |
| `POST` | `/api/v1/admin/features/:bundleId/uninstall` | 관리자(`features:manage`) | 기능 번들 제거 및 모델 파일 정리 |
| `GET` | `/api/v1/admin/features/disk-usage` | 관리자(`features:manage`) | AI 모델의 총 디스크 사용량 획득 |
| `POST` | `/api/v1/admin/features/import` | 관리자(`features:manage`) | 레거시 AI 번들(`file`) 또는 서명된 오프라인 OCR 릴리스(`index` + `archive`) 가져오기 |

에어 갭 OCR 가져오기에는 릴리스의 서명이 포함되어야 합니다. `ocr-runtime-index.json` 그리고 일치하는 플랫폼 아카이브. SnapOtter 동일하게 적용됩니다 Ed25519 서명, 아티팩트 해시, 호환성, 추출, 온라인 설치에 사용되는 연기 테스트 검사:

```bash
curl -X POST http://localhost:1349/api/v1/admin/features/import \
  -H "Authorization: Bearer <admin-token>" \
  -F "index=@ocr-runtime-index.json" \
  -F "archive=@ocr-linux-amd64-cpu-py312.tar.gz"
```

사용 `linux-arm64-cpu-py311` 에 보관 arm64. 다른 대상에 대해 서명된 아티팩트는 설치되지 않고 거부됩니다.

## 관리 작업 {#admin-operations}

관찰 가능성, 지원, 사용량 보고, 백업 상태를 위한 운영 엔드포인트.

| 메서드 | 경로 | 접근 권한 | 설명 |
|--------|------|--------|-------------|
| `GET` | `/api/v1/admin/log-level` | 관리자(`settings:write`) | 현재 런타임 로그 레벨 읽기 |
| `POST` | `/api/v1/admin/log-level` | 관리자(`settings:write`) | 런타임 로그 레벨 변경(`fatal`, `error`, `warn`, `info`, `debug`, `trace` 또는 `silent`) |
| `GET` | `/api/v1/metrics` | 관리자(`system:health`) | 텍스트 형식의 Prometheus 메트릭 |
| `GET` | `/api/v1/admin/support-bundle` | 관리자(`system:health`) | 편집된 진단 지원 번들 ZIP 다운로드 |
| `GET` | `/api/v1/admin/usage` | 관리자(`audit:read`) | 선택적 `days` 쿼리 매개변수가 있는 사용량 대시보드 데이터 |
| `GET` | `/api/v1/admin/backup-status` | 관리자(`system:health`) | 마지막 백업 메타데이터와 최신성 상태 읽기 |
| `POST` | `/api/v1/admin/backup-status` | 관리자(`system:health`) | 완료된 백업 기록(`type`, 선택적 `sizeBytes`, 선택적 `notes`) |

## 엔터프라이즈 API {#enterprise-apis}

이 경로들은 관련 엔터프라이즈 기능에 의해 라이선스 게이트가 적용됩니다. 여전히 나열된 SnapOtter 권한이 필요합니다.

**전체 권한의 기본 제공 관리자**는 인증된 주체가 `admin` 역할과 전체 유효 관리자 권한 집합을 보유함을 의미합니다. 관리자 권한이 하나라도 누락된 API 키 범위는 자격이 없습니다.

| 메서드 | 경로 | 접근 권한 | 설명 |
|--------|------|--------|-------------|
| `GET` | `/api/v1/enterprise/audit/export` | 관리자(`audit:read`) | 필터와 함께 감사 항목을 JSON 또는 CSV로 내보내기 |
| `GET` | `/api/v1/enterprise/config/export` | 전체 권한의 기본 제공 관리자 | 편집된 인스턴스 구성, 커스텀 역할, 팀 내보내기 |
| `POST` | `/api/v1/enterprise/config/import` | 전체 권한의 기본 제공 관리자 | 선택적 드라이런과 함께 구성 가져오기 |
| `GET` | `/api/v1/enterprise/ip-allowlist` | 관리자(`security:manage`) | 구성된 CIDR 허용 목록 읽기 |
| `PUT` | `/api/v1/enterprise/ip-allowlist` | 관리자(`security:manage`) | 자기 잠금 방지와 함께 CIDR 허용 목록 업데이트 |
| `GET` | `/api/v1/enterprise/legal-hold` | 관리자(`compliance:manage`) | 사용자 및 팀 법적 보존 목록 |
| `PUT` | `/api/v1/enterprise/legal-hold` | 관리자(`compliance:manage`) | 사용자 또는 팀에 법적 보존 적용 또는 해제 |
| `POST` | `/api/v1/enterprise/scim/token` | 관리자(`users:manage`) | SCIM 베어러 토큰 생성, 한 번만 반환됨 |
| `DELETE` | `/api/v1/enterprise/scim/token` | 관리자(`users:manage`) | 현재 SCIM 베어러 토큰 취소 |
| `GET` | `/api/v1/enterprise/siem/config` | 관리자(`webhooks:manage`) | SIEM 포워딩 구성 읽기 |
| `PUT` | `/api/v1/enterprise/siem/config` | 관리자(`webhooks:manage`) | SIEM 포워딩 구성 업데이트 |
| `GET` | `/api/v1/enterprise/webhooks` | 관리자(`webhooks:manage`) | 웹훅 대상 목록 |
| `POST` | `/api/v1/enterprise/webhooks` | 관리자(`webhooks:manage`) | 웹훅 대상 생성 |
| `PUT` | `/api/v1/enterprise/webhooks/:index` | 관리자(`webhooks:manage`) | 웹훅 대상 업데이트 |
| `DELETE` | `/api/v1/enterprise/webhooks/:index` | 관리자(`webhooks:manage`) | 웹훅 대상 삭제 |
| `POST` | `/api/v1/enterprise/webhooks/:index/test` | 관리자(`webhooks:manage`) | 테스트 웹훅 페이로드 전송 |
| `POST` | `/api/v1/enterprise/users/:id/export` | 관리자(`compliance:manage`) | GDPR 사용자 내보내기 작업 시작 |
| `GET` | `/api/v1/enterprise/users/:id/export/:jobId` | 관리자(`compliance:manage`) | GDPR 내보내기 상태 및 다운로드 URL 읽기 |
| `DELETE` | `/api/v1/enterprise/users/:id/purge` | 관리자(`compliance:manage`) | 확인 후 사용자 데이터 영구 삭제 |
| `DELETE` | `/api/v1/enterprise/teams/:id/purge` | 관리자(`compliance:manage`) | 확인 후 팀 데이터 영구 삭제 |
| `GET` | `/api/v1/admin/version` | 관리자(`system:health`) | 앱, 빌드, Node, 스키마 버전 메타데이터 읽기 |
| `GET` | `/api/v1/admin/migrations/pending` | 관리자(`system:health`) | 패키징된 마이그레이션과 적용된 마이그레이션 비교 |
| `GET` | `/api/v1/admin/upgrade-check` | 관리자(`system:health`) | 업그레이드 준비 상태 검사 실행 |

### SCIM 2.0 {#scim-2-0}

SCIM 디스커버리 엔드포인트는 공개입니다. 사용자 및 그룹 엔드포인트는 위에서 생성한 SCIM 베어러 토큰이 필요합니다.

| 메서드 | 경로 | 접근 권한 | 설명 |
|--------|------|--------|-------------|
| `GET` | `/api/v1/scim/v2/ServiceProviderConfig` | 공개 | SCIM 서버 기능 |
| `GET` | `/api/v1/scim/v2/Schemas` | 공개 | SCIM 스키마 디스커버리 |
| `GET` | `/api/v1/scim/v2/ResourceTypes` | 공개 | SCIM 리소스 유형 디스커버리 |
| `GET` | `/api/v1/scim/v2/Users` | SCIM 토큰 | 선택적 SCIM 필터가 있는 사용자 목록 |
| `POST` | `/api/v1/scim/v2/Users` | SCIM 토큰 | 사용자 생성 |
| `GET` | `/api/v1/scim/v2/Users/:id` | SCIM 토큰 | 사용자 획득 |
| `PUT` | `/api/v1/scim/v2/Users/:id` | SCIM 토큰 | 사용자 교체 |
| `DELETE` | `/api/v1/scim/v2/Users/:id` | SCIM 토큰 | 사용자 소프트 비활성화 |
| `GET` | `/api/v1/scim/v2/Groups` | SCIM 토큰 | 팀을 SCIM 그룹으로 목록화 |
| `POST` | `/api/v1/scim/v2/Groups` | SCIM 토큰 | 팀 생성 |
| `GET` | `/api/v1/scim/v2/Groups/:id` | SCIM 토큰 | 팀 획득 |
| `PUT` | `/api/v1/scim/v2/Groups/:id` | SCIM 토큰 | 팀 및 그룹 멤버십 교체 |
| `DELETE` | `/api/v1/scim/v2/Groups/:id` | SCIM 토큰 | 팀 삭제 |

## 밈 템플릿 {#meme-templates}

밈 생성기 도구를 위한 지원 API.

| 메서드 | 경로 | 접근 권한 | 설명 |
|--------|------|--------|-------------|
| `GET` | `/api/v1/meme-templates` | 인증 | 텍스트 상자 위치와 함께 사용 가능한 모든 밈 템플릿 목록 |
| `GET` | `/api/v1/meme-templates/full/:filename` | 인증 | 전체 크기 템플릿 이미지 제공 |
| `GET` | `/api/v1/meme-templates/thumbs/:filename` | 인증 | 템플릿 썸네일 제공 |
| `GET` | `/api/v1/meme-templates/fonts/:filename` | 인증 | 밈 텍스트 렌더링에 사용되는 폰트 파일 제공 |

## 오류 응답 {#error-responses}

모든 오류는 JSON을 반환합니다:

```json
{
  "error": "Human-readable message",
  "code": "MACHINE_READABLE_CODE"
}
```

| 상태 | 의미 |
|--------|---------|
| 400 | 잘못된 요청 / 검증 실패 |
| 401 | 인증되지 않음 |
| 403 | 권한 부족 |
| 404 | 리소스를 찾을 수 없음 |
| 413 | 파일이 너무 큼(`MAX_UPLOAD_SIZE_MB` 참고) |
| 422 | 검증 후 처리 실패 |
| 429 | 속도 제한(`RATE_LIMIT_PER_MIN` 참고) |
| 501 | 필수 AI 기능 번들이 설치되지 않음(`FEATURE_NOT_INSTALLED`) |
| 500 | 내부 서버 오류 |
