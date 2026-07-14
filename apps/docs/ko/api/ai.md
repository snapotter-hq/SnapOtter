---
description: "모든 로컬 ML 도구를 다루는 AI 엔진 레퍼런스. 배경 제거, 업스케일링, OCR, 얼굴 감지, 사진 복원 등."
i18n_output_hash: 534278b9910c
i18n_source_hash: aa9a56cdddc7
i18n_provenance: human
---

# AI 엔진 레퍼런스 {#ai-engine-reference}

`@snapotter/ai` 패키지는 로컬 ML 작업을 위해 기본 도구와 Python 런타임을 조정합니다. 대부분의 ML 도구는 빠른 웜 스타트를 위해 영구 Python sidecar 를 사용합니다. OCR 는 의도적으로 분리되어 있습니다. `fast`는 기본 Tesseract 바이너리를 호출하는 반면, `balanced` 및 `best`는 `/data/ai/v3` 아래의 활성 불변 RapidOCR 세대에 고정된 전용 영구 JSONL dispatcher 를 사용합니다. 각 요청에는 generation lease 가 포함됩니다. 업그레이드 중에 SnapOtter 는 활성화하기 전에 후보에서 smoke test 를 실행하고 새로운 dispatcher 로 원자적으로 전환한 다음 garbage collection 이전의 이전 세대를 제거합니다.

NVIDIA CUDA 는 이를 지원하는 런타임에서 자동 감지되고 사용됩니다. OCR 는 NVIDIA GPU가 있는 시스템을 포함하여 모든 호스트에서 CPU 를 사용하여 이 도구에 대한 CUDA 및 드라이버 결합을 방지합니다.

VA-API, Quick Sync, OpenCL을 통한 Intel/AMD iGPU 가속은 현재 AI 추론에 지원되지 않는다. CUDA를 지원하는 NVIDIA GPU가 없는 한, 컨테이너에 `/dev/dri`를 매핑해도 이러한 Python 사이드카 도구는 가속되지 않는다.

네 가지 모달리티(이미지, 오디오, 비디오, 문서)에 걸쳐 19개의 Python 사이드카 AI 도구가 있으며, 여기에 선택적 AI 기능을 갖춘 2개의 도구가 추가된다. 모든 모델은 로컬에서 실행되며, 최초 모델 다운로드 이후에는 인터넷이 필요하지 않다.


<!-- korean-ocr-contract:start -->
::: info 한국어 OCR 호환성
빠른 OCR은 `auto`, `en`, `de`, `es`, `fr`, `zh`, `ja`를 지원하지만 한국어(`ko`)는 지원하지 않습니다. 한국어에는 정확한 OCR 팩과 `balanced` 또는 `best`가 필요합니다. 이 팩은 공식 Linux amd64 및 arm64 컨테이너에서 작동하며 NVIDIA 호스트에서도 OCR은 CPU에서 실행됩니다. 지원되지 않는 시스템은 명시적인 호환성 오류를 반환하며 조용히 `fast`로 대체하지 않습니다. 한국어에 `fast` 또는 이전 `tesseract` 별칭을 지정하면 큐에 넣기 전에 `FEATURE_INCOMPATIBLE` 및 `fast-korean-unsupported`로 거부됩니다.
:::
<!-- korean-ocr-contract:end -->
## 아키텍처 {#architecture}

```
Node.js Tool Route
      |
      v
 @snapotter/ai bridge.ts
      | (stdin/stdout JSON + stderr progress events)
      v
 +-- Native Tesseract + Ghostscript (fast image/PDF OCR)
 |
 +-- Isolated OCR runtime (persistent JSONL dispatcher)
 |     `-- RapidOCR + ONNX Runtime CPU + pinned PP-OCR models
 |
 `-- Python dispatcher (persistent process, "ai" profile)
      |
      |-- remove_bg.py        (rembg / BiRefNet)
      |-- upscale.py          (RealESRGAN)
      |-- inpaint.py          (LaMa ONNX)
      |-- outpaint.py         (LaMa canvas expansion)
      |-- detect_faces.py     (MediaPipe)
      |-- face_landmarks.py   (MediaPipe landmarks)
      |-- enhance_faces.py    (GFPGAN / CodeFormer)
      |-- colorize.py         (DDColor)
      |-- noise_removal.py    (SCUNet / tiered denoising)
      |-- red_eye_removal.py  (landmark + color analysis)
      |-- restore.py          (scratch repair + enhancement + denoising)
      |-- transcribe.py       (faster-whisper speech-to-text)
      +-- install_feature.py  (on-demand bundle installer)
```

별도의 "docs" 디스패처 프로파일은 AI 허용 목록을 문서 처리 스크립트(`doc_pagecount`, `doc_health`, `doc_flatten`, `doc_redact`, `doc_text`, `doc_to_word`, `doc_metadata`, `doc_html_pdf`)로 대체하고 무거운 ML 임포트를 건너뛴다.

**타임아웃:** 기본 300초. OCR과 BiRefNet 배경 제거는 600초가 주어진다.

## 기능 번들 {#feature-bundles}

AI 모델은 도구별로 아카이브 하나씩이 아니라 공유 의존성 스택 단위로 패키징된다. 하나의 기능 번들은 여러 도구가 동일한 모델 계열, Python 휠, 또는 네이티브 라이브러리를 사용할 때 그 도구들을 함께 활성화할 수 있다. 이렇게 하면 릴리스 Docker 이미지가 더 작게 유지되고, 동일한 배경 매팅, 얼굴 감지, OCR, 복원, 음성 모델의 중복 사본을 저장하는 일을 피할 수 있다.

Docker 이미지는 애플리케이션과 공통 런타임을 함께 제공한다. 대용량 모델 아카이브는 필요할 때 상시 유지되는 `/data/ai` 볼륨으로 다운로드된 뒤, 이를 필요로 하는 모든 도구가 재사용한다. 다른 도구가 이미 필요로 해서 어떤 번들이 이미 설치되어 있다면, 새로 의존하는 도구를 활성화해도 그 번들을 다시 다운로드하지 않는다.

대부분의 AI 도구를 실행하려면 하나 이상의 기능 번들이 필요합니다. 관리 UI는 전체 번들 목록을 확인하고 이미 설치된 번들을 건너뛰며 누락된 다운로드만 대기열에 추가하는 `POST /api/v1/admin/tools/:toolId/features/install`를 통해 도구로 해당 항목을 설치합니다. 예를 들어, 새로운 인스턴스 큐 `background-removal` 및 `face-detection`에서 여권 사진을 활성화합니다. 백그라운드 제거가 이미 설치된 후에 활성화하면 `face-detection`만 대기열에 추가됩니다. OCR 는 예외입니다. `fast`에는 팩이 필요하지 않기 때문입니다. UI 또는 `POST /api/v1/admin/features/ocr/install`를 통해 선택적 정확한 런타임을 설치합니다.

| 번들 | 크기 | 공유 의존성 그룹 | 사용하는 도구 |
|--------|------|-------------------------|-------------------|
| `background-removal` | 4-5 GB | rembg / BiRefNet 배경 매팅 | remove-background, passport-photo, transparency-fixer, background-replace, blur-background |
| `face-detection` | 200-300 MB | MediaPipe 얼굴 감지 및 랜드마크 | blur-faces, red-eye-removal, smart-crop |
| `object-eraser-colorize` | 1-2 GB | LaMa 인페인팅/아웃페인팅 및 DDColor | erase-object, colorize, ai-canvas-expand |
| `upscale-enhance` | 5-6 GB | RealESRGAN, GFPGAN / CodeFormer, 노이즈 제거 | upscale, enhance-faces, noise-removal |
| `photo-restoration` | 4-5 GB | 스크래치 복구 및 복원 파이프라인 | restore-photo |
| `ocr` | ~208-234 MiB 다운로드 / ~409-488 MiB 설치됨 | 옵션 RapidOCR 3.9.1, ONNX Runtime 1.20.1 및 고정형 PP-OCR 모델 | ocr, ocr-pdf(`balanced` 및 `best`에만 해당) |
| `transcription` | ~600 MB | faster-whisper 음성-텍스트 변환 모델 | transcribe-audio, auto-subtitles |

교차 번들 의존성을 갖는 도구:

| 도구 | 필요한 번들 | 이유 |
|------|------------------|-----|
| `passport-photo` | `background-removal`, `face-detection` | 배경을 제거한 뒤, 얼굴 랜드마크를 사용해 여권 및 신분증 사진 규정에 맞게 크롭 구도를 잡는다. |
| `enhance-faces` | `upscale-enhance`, `face-detection` | 선택된 얼굴 영역에 GFPGAN 또는 CodeFormer 보정을 적용하기 전에 얼굴을 감지한다. |

도구는 OCR 를 제외하고 모든 필수 번들이 설치된 경우에만 사용할 수 있습니다. 내장된 `fast` 계층은 선택적 OCR 팩 없이도 계속 사용할 수 있습니다. 부분 설치는 유효하며 증분적으로 처리됩니다. 설치된 번들은 재사용되고, 누락된 번들은 다운로드로 표시되며, 대기 중인 설치는 한 번에 하나씩 실행되므로 공유 Python 환경이 동시에 수정되지 않습니다.

### 정확한 OCR 런타임 설치 {#accurate-ocr-runtime-installation}

정확한 OCR 팩은 공식 Linux amd64 또는 Linux arm64 컨테이너를 위한 플랫폼별 런타임입니다. amd64 빌드는 Python 3.12를 사용하고 arm64 빌드는 Python 3.11을 사용합니다. 두 빌드 모두 ONNX Runtime의 `CPUExecutionProvider`를 통해 RapidOCR를 실행하므로 동일한 팩이 CPU 전용 및 NVIDIA Docker 호스트에서 작동합니다. 정확한 런타임에는 최소 4 GiB의 유효 메모리(구성된 컨테이너 cgroup 제한, 없으면 호스트 메모리)가 필요합니다. 서명된 호환성 최소값 미만의 시스템은 다운로드 전에 거부됩니다. 이 요구 사항은 내장 Fast OCR에는 적용되지 않습니다. Bare-metal 빌드는 libc 및 Python ABI를 안전하게 추론할 수 없으므로 거부됩니다. 호스트가 Tesseract와 Ghostscript를 제공하면 Fast OCR는 계속 사용할 수 있습니다.

선택적 아티팩트는 아키텍처에 따라 약 208-234 MiB 압축 및 409-488 MiB 추출입니다. 서명된 인덱스는 설치 프로그램에서 적용한 정확한 압축 및 추출 바이트 수를 바인딩합니다. 내장된 Tesseract 는 공식 이미지에 약 25개의 MiB 를 추가하며 `/data/ai`에는 파일이 필요하지 않습니다.

온라인 설치는 현재 플랫폼에 대한 서명된 릴리스 색인과 정확한 콘텐츠 주소 지정 아티팩트를 가져옵니다. SnapOtter 는 새로운 세대를 원자적으로 활성화하기 전에 Ed25519 인덱스 서명, 아티팩트 크기, SHA-256 다이제스트, 모델 다이제스트, 경로, 파일 모드 및 스테이지된 smoke test 를 확인합니다. 설치가 실패하면 이전 정상 세대가 활성 상태로 유지됩니다.

에어갭 설치의 경우 `index` 및 `archive`라는 다중 부분 필드를 사용하여 릴리스의 `ocr-runtime-index.json` 및 일치하는 OCR 런타임 아카이브를 모두 `POST /api/v1/admin/features/import`에 업로드합니다. 오프라인 가져오기는 온라인 설치와 동일한 서명, 해시, 추출, 호환성 및 스모크 테스트 검사를 적용합니다. 신뢰할 수 있는 서명된 인덱스가 없는 아카이브는 거부됩니다.

---

## 배경 제거 {#background-removal}

**도구 경로:** `remove-background`  
**모델:** rembg with BiRefNet (기본값) 또는 U2-Net 변형

| 매개변수 | 타입 | 기본값 | 설명 |
|-----------|------|---------|-------------|
| `model` | string | - | 모델 변형 (선택적 재정의) |
| `backgroundType` | string | `"transparent"` | 다음 중 하나: `transparent`, `color`, `gradient`, `blur`, `image` |
| `backgroundColor` | string | - | 단색 배경용 Hex 색상 |
| `gradientColor1` | string | - | 첫 번째 그라디언트 색상 |
| `gradientColor2` | string | - | 두 번째 그라디언트 색상 |
| `gradientAngle` | number | - | 그라디언트 각도(도 단위) |
| `blurEnabled` | boolean | - | 배경 블러 효과 활성화 |
| `blurIntensity` | number (0-100) | - | 블러 강도 |
| `shadowEnabled` | boolean | - | 피사체에 드롭 섀도 활성화 |
| `shadowOpacity` | number (0-100) | - | 그림자 불투명도 |
| `outputFormat` | string | - | 출력 형식: `png`, `webp`, 또는 `avif` |
| `edgeRefine` | integer (0-3) | - | 가장자리 정제 수준 |
| `decontaminate` | boolean | - | 가장자리의 색상 번짐 제거 |

## 배경 교체 {#background-replace}

**도구 경로:** `background-replace`  
**모델:** rembg / BiRefNet (remove-background와 공유)

배경을 제거하고 단색 또는 그라디언트로 교체한다.

| 매개변수 | 타입 | 기본값 | 설명 |
|-----------|------|---------|-------------|
| `backgroundType` | `"color"` \| `"gradient"` | `"color"` | 배경 모드 |
| `color` | string | `"#ffffff"` | 배경 hex 색상 (`backgroundType`이 `color`일 때) |
| `gradientColor1` | string | - | 첫 번째 그라디언트 hex 색상 |
| `gradientColor2` | string | - | 두 번째 그라디언트 hex 색상 |
| `gradientAngle` | integer (0-360) | `180` | 그라디언트 각도(도 단위) |
| `feather` | integer (0-20) | `0` | 가장자리 페더링 반경 |
| `format` | `"png"` \| `"webp"` | `"png"` | 출력 형식 |

## 배경 블러 {#blur-background}

**도구 경로:** `blur-background`  
**모델:** rembg / BiRefNet (remove-background와 공유)

피사체는 선명하게 유지하면서 배경을 흐리게 만든다.

| 매개변수 | 타입 | 기본값 | 설명 |
|-----------|------|---------|-------------|
| `intensity` | integer (1-100) | `50` | 블러 강도 |
| `feather` | integer (0-20) | `0` | 가장자리 페더링 반경 |
| `format` | `"png"` \| `"webp"` | `"png"` | 출력 형식 |

## 이미지 업스케일링 {#image-upscaling}

**도구 경로:** `upscale`  
**모델:** RealESRGAN (사용 불가 시 Lanczos 폴백)

| 매개변수 | 타입 | 기본값 | 설명 |
|-----------|------|---------|-------------|
| `scale` | number | `2` | 업스케일 배율 |
| `model` | string | `"auto"` | 모델 변형 |
| `faceEnhance` | boolean | `false` | GFPGAN 얼굴 보정 패스 적용 |
| `denoise` | number | `0` | 노이즈 제거 강도 |
| `format` | string | `"auto"` | 출력 형식 재정의 |
| `quality` | number | `95` | 출력 품질 (1-100) |

## OCR / 텍스트 추출 {#ocr-text-extraction}

**도구 경로:** `ocr`  
**모델:** Tesseract(`fast`); RapidOCR(PP-OCRv6 소형 모델 포함)(`balanced`); 보정된 변형 점수가 포함된 PP-OCRv6 중형 모델(`best`)

| 매개변수 | 타입 | 기본값 | 설명 |
|-----------|------|---------|-------------|
| `quality` | `"fast"` \| `"balanced"` \| `"best"` | 동적 | `quality`와 `engine`을 생략하면 SnapOtter는 `best`, `balanced`, `fast` 순으로 사용 가능한 최상위 등급을 선택합니다. 한국어에서는 `fast`를 선택하지 않으며 `best`, 그다음 `balanced`를 사용하고, 둘 다 없으면 정확한 런타임의 설치 또는 호환성 오류를 반환합니다. |
| `language` | string | `"auto"` | 언어: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| `enhance` | 부울 | 계층에 따라 다름 | 로컬 대비를 향상시킵니다. 빠르게 직접 적용합니다. 정확한 계층은 보정된 점수가 OCR 를 향상시키는 경우에만 변형을 유지합니다. 최고에 대한 기본값은 켜져 있습니다. |
| `engine` | 끈 | - | 더 이상 사용되지 않는 호환성 별칭입니다. `tesseract`를 `fast`에 매핑하고 레거시 `paddleocr` 값을 `balanced`에 매핑합니다. PaddlePaddle 를 로드하지 않습니다. |

추출된 텍스트와 출처 메타데이터(엔진, 요청 및 실제 품질, 장치, 공급자, 성능 저하 상태, 경고, 해당되는 경우 정확한 런타임/모델 버전)를 반환합니다. 명시적인 품질 요청은 다른 계층으로 돌아가지 않습니다. `balanced` 또는 `best`를 사용할 수 없는 경우 API 는 `fast`를 자동으로 실행하는 대신 `FEATURE_NOT_INSTALLED` 또는 `FEATURE_INCOMPATIBLE`를 반환합니다.

## PDF OCR {#pdf-ocr}

**도구 경로:** `ocr-pdf`  
**모델:** 이미지 OCR와 동일한 등급 체계

AI 기반 OCR을 사용해 스캔된 PDF 문서에서 페이지별로 텍스트를 추출한다.

| 매개변수 | 타입 | 기본값 | 설명 |
|-----------|------|---------|-------------|
| `quality` | `"fast"` \| `"balanced"` \| `"best"` | 동적 | `quality`와 `engine`을 생략하면 SnapOtter는 `best`, `balanced`, `fast` 순으로 사용 가능한 최상위 등급을 선택합니다. 한국어에서는 `fast`를 선택하지 않으며 `best`, 그다음 `balanced`를 사용하고, 둘 다 없으면 정확한 런타임의 설치 또는 호환성 오류를 반환합니다. |
| `language` | string | `"auto"` | 언어: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| `pages` | string | `"all"` | 페이지 선택: `"all"`, `"1-3"`, `"1,3,5"` |
| `enhance` | 부울 | 계층에 따라 다름 | 로컬 대비를 향상시킵니다. 빠르게 직접 적용합니다. 정확한 계층은 보정된 점수가 OCR 를 향상시키는 경우에만 변형을 유지합니다. 최고에 대한 기본값은 켜져 있습니다. |
| `engine` | 끈 | - | 더 이상 사용되지 않는 호환성 별칭입니다. `tesseract`를 `fast`에 매핑하고 레거시 `paddleocr` 값을 `balanced`에 매핑합니다. PaddlePaddle 를 로드하지 않습니다. |

PDF OCR 에도 동일한 다운그레이드 금지 규칙이 적용됩니다. PDF 페이지는 인식되기 전에 래스터화되며, 한 요청으로 최대 50페이지를 선택할 수 있습니다.

## 얼굴 / PII 블러 {#face-pii-blur}

**도구 경로:** `blur-faces`  
**모델:** MediaPipe 얼굴 감지

| 매개변수 | 타입 | 기본값 | 설명 |
|-----------|------|---------|-------------|
| `blurRadius` | number (1-100) | `30` | 가우시안 블러 반경 |
| `sensitivity` | number (0-1) | `0.5` | 감지 신뢰도 임계값 |

## 얼굴 보정 {#face-enhancement}

**도구 경로:** `enhance-faces`  
**모델:** GFPGAN, CodeFormer

| 매개변수 | 타입 | 기본값 | 설명 |
|-----------|------|---------|-------------|
| `model` | `"auto"` \| `"gfpgan"` \| `"codeformer"` | `"auto"` | 보정 모델 |
| `strength` | number (0-1) | `0.8` | 보정 강도 |
| `sensitivity` | number (0-1) | `0.5` | 얼굴 감지 임계값 |
| `onlyCenterFace` | boolean | `false` | 가장 중앙에 있는 얼굴만 보정 |

## AI 컬러화 {#ai-colorization}

**도구 경로:** `colorize`  
**모델:** DDColor (OpenCV DNN 폴백)

흑백 또는 그레이스케일 사진을 풀컬러로 변환한다.

| 매개변수 | 타입 | 기본값 | 설명 |
|-----------|------|---------|-------------|
| `intensity` | number (0-1) | `1.0` | 색상 채도 강도 |
| `model` | `"auto"` \| `"ddcolor"` \| `"opencv"` | `"auto"` | 모델 변형 |

## 노이즈 제거 {#noise-removal}

**도구 경로:** `noise-removal`  
**모델:** SCUNet (등급형 노이즈 제거 파이프라인)

| 매개변수 | 타입 | 기본값 | 설명 |
|-----------|------|---------|-------------|
| `tier` | `"quick"` \| `"balanced"` \| `"quality"` \| `"maximum"` | `"balanced"` | 처리 등급 |
| `strength` | number (0-100) | `50` | 노이즈 제거 강도 |
| `detailPreservation` | number (0-100) | `50` | 보존할 디테일 정도. 높을수록 텍스처가 더 많이 유지됨 |
| `colorNoise` | number (0-100) | `30` | 컬러 노이즈 감소 강도 |
| `format` | string | `"original"` | 출력 형식: `original`, `png`, `jpeg`, `webp`, `avif`, `jxl` |
| `quality` | number (1-100) | `90` | 출력 인코딩 품질 |

## 적목 현상 제거 {#red-eye-removal}

**도구 경로:** `red-eye-removal`

얼굴 랜드마크를 감지하고 눈 영역을 찾아 적색 채널 과포화를 보정한다.

| 매개변수 | 타입 | 기본값 | 설명 |
|-----------|------|---------|-------------|
| `sensitivity` | number (0-100) | `50` | 적색 픽셀 감지 임계값 |
| `strength` | number (0-100) | `70` | 보정 강도 |
| `format` | string | - | 출력 형식 재정의 (선택 사항) |
| `quality` | number (1-100) | `90` | 출력 품질 |

## 사진 복원 {#photo-restoration}

**도구 경로:** `restore-photo`

오래되거나 손상된 사진을 위한 다단계 파이프라인: 스크래치/찢김 감지 및 복구, 얼굴 보정, 노이즈 제거, 그리고 선택적 컬러화.

| 매개변수 | 타입 | 기본값 | 설명 |
|-----------|------|---------|-------------|
| `scratchRemoval` | boolean | `true` | 스크래치, 찢김 감지 및 복구 |
| `faceEnhancement` | boolean | `true` | 얼굴 보정 패스 적용 |
| `fidelity` | number (0-1) | `0.7` | 얼굴 보정 강도 (높을수록 더 보수적) |
| `denoise` | boolean | `true` | 노이즈 제거 패스 적용 |
| `denoiseStrength` | number (0-100) | `25` | 노이즈 제거 강도 |
| `colorize` | boolean | `false` | 복원 후 컬러화 |
| `colorizeStrength` | number (0-100) | `85` | 컬러화 강도 |

## 여권 사진 {#passport-photo}

**도구 경로:** `passport-photo`  
**모델:** MediaPipe 얼굴 랜드마크 + BiRefNet 배경 제거

두 단계 워크플로: 분석(얼굴 감지 + 배경 제거) 후 생성(크롭, 크기 조정, 타일 배치). 6개 지역에 걸쳐 37개 이상의 국가를 지원한다.

### 1단계: 분석 {#phase-1-analyze}

`POST /api/v1/tools/image/passport-photo/analyze`

이미지 파일(multipart)을 받는다. 얼굴 랜드마크 데이터, base64 미리보기, 이미지 치수를 반환한다.

### 2단계: 생성 {#phase-2-generate}

`POST /api/v1/tools/image/passport-photo/generate`

1단계 결과와 생성 설정이 담긴 JSON 본문을 받는다:

| 매개변수 | 타입 | 기본값 | 설명 |
|-----------|------|---------|-------------|
| `jobId` | string | (필수) | 1단계의 작업 ID |
| `filename` | string | (필수) | 1단계의 원본 파일 이름 |
| `countryCode` | string | (필수) | ISO 국가 코드 (예: `US`, `GB`, `IN`) |
| `documentType` | string | `"passport"` | 문서 유형 |
| `bgColor` | string | `"#FFFFFF"` | 배경 색상 hex |
| `printLayout` | string | `"none"` | 인쇄 레이아웃: `none`, `4x6`, `a4`, `letter` |
| `maxFileSizeKb` | number | `0` | 최대 파일 크기(KB) (0 = 제한 없음) |
| `dpi` | number (72-1200) | `300` | 출력 DPI |
| `customWidthMm` | number | - | 사용자 지정 너비(mm) (국가 사양을 재정의) |
| `customHeightMm` | number | - | 사용자 지정 높이(mm) (국가 사양을 재정의) |
| `zoom` | number (0.5-3) | `1` | 줌 배율 |
| `adjustX` | number | `0` | 수평 위치 조정 |
| `adjustY` | number | `0` | 수직 위치 조정 |
| `landmarks` | object | (필수) | 1단계의 랜드마크 |
| `imageWidth` | number | (필수) | 1단계의 이미지 너비 |
| `imageHeight` | number | (필수) | 1단계의 이미지 높이 |

## 객체 지우기 (인페인팅) {#object-erasing-inpainting}

**도구 경로:** `erase-object`  
**모델:** ONNX Runtime을 통한 LaMa

마스크는 base64가 아니라 **두 번째 파일 파트**(fieldname `mask`)로 전송된다. 마스크에서 흰색 픽셀은 지울 영역을 나타낸다. `format`와 `quality` 설정은 최상위 폼 필드로 전송된다.

| 매개변수 | 타입 | 기본값 | 설명 |
|-----------|------|---------|-------------|
| `file` | file | (필수) | 원본 이미지 (multipart) |
| `mask` | file | (필수) | 마스크 이미지 (multipart, fieldname `mask`, 흰색 = 지우기) |
| `format` | string | `"auto"` | 출력 형식: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| `quality` | integer (1-100) | `95` | 출력 품질 |

NVIDIA GPU가 있을 때 CUDA 가속된다.

## AI 캔버스 확장 {#ai-canvas-expand}

**도구 경로:** `ai-canvas-expand`  
**모델:** LaMa 기반 아웃페인팅

이미지의 캔버스를 어느 방향으로든 확장하고, 새 영역을 기존 이미지와 어울리는 AI 생성 콘텐츠로 채운다.

| 매개변수 | 타입 | 기본값 | 설명 |
|-----------|------|---------|-------------|
| `extendTop` | integer | `0` | 위쪽으로 확장할 픽셀 |
| `extendRight` | integer | `0` | 오른쪽으로 확장할 픽셀 |
| `extendBottom` | integer | `0` | 아래쪽으로 확장할 픽셀 |
| `extendLeft` | integer | `0` | 왼쪽으로 확장할 픽셀 |
| `tier` | `"fast"` \| `"balanced"` \| `"high"` | `"balanced"` | 품질 등급 |
| `format` | string | `"auto"` | 출력 형식: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| `quality` | integer (1-100) | `95` | 출력 품질 |

확장 방향 중 하나 이상이 0보다 커야 한다.

## 스마트 크롭 {#smart-crop}

**도구 경로:** `smart-crop`  
**모델:** MediaPipe 얼굴 감지 (얼굴 모드 전용)

| 매개변수 | 타입 | 기본값 | 설명 |
|-----------|------|---------|-------------|
| `mode` | string | `"subject"` | 크롭 전략: `subject`, `face`, `trim` |
| `strategy` | `"attention"` \| `"entropy"` | `"attention"` | 피사체 모드 전략 |
| `width` | integer | - | 출력 너비 |
| `height` | integer | - | 출력 높이 |
| `padding` | integer (0-50) | `0` | 피사체 주변 여백 백분율 |
| `facePreset` | string | `"head-shoulders"` | `mode=face`일 때의 프리셋 구도 |
| `sensitivity` | number (0-1) | `0.5` | 얼굴 감지 임계값 |
| `threshold` | integer (0-255) | `30` | 배경 감지 임계값 (트림 모드) |
| `padToSquare` | boolean | `false` | 트림된 결과를 정사각형으로 패딩 |
| `padColor` | string | `"#ffffff"` | 정사각형 패딩용 배경 색상 |
| `targetSize` | integer | - | 패딩된 출력의 목표 크기(픽셀) |
| `quality` | integer (1-100) | - | 출력 품질 |

레거시 `mode` 값 `attention`와 `content`은 허용되며 각각 `subject`와 `trim`로 매핑된다.

**얼굴 프리셋:**

| 프리셋 | 적합한 용도 |
|--------|---------|
| `closeup` | 헤드샷 |
| `head-shoulders` | 프로필 사진 |
| `upper-body` | LinkedIn / 격식 있는 용도 |
| `half-body` | 상반신 전체 |

## 오디오 전사 {#transcribe-audio}

**도구 경로:** `transcribe-audio`  
**모델:** faster-whisper

음성을 텍스트로 변환한다. 일반 텍스트, SRT, VTT 출력 형식을 지원한다.

| 매개변수 | 타입 | 기본값 | 설명 |
|-----------|------|---------|-------------|
| `language` | string | `"auto"` | 언어: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| `outputFormat` | `"txt"` \| `"srt"` \| `"vtt"` | `"txt"` | 출력 형식 |

## 자동 자막 {#auto-subtitles}

**도구 경로:** `auto-subtitles`  
**모델:** faster-whisper (비디오에서 오디오를 추출한 뒤 전사)

비디오의 오디오 트랙에서 자막 파일을 생성한다.

| 매개변수 | 타입 | 기본값 | 설명 |
|-----------|------|---------|-------------|
| `language` | string | `"auto"` | 언어: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| `format` | `"srt"` \| `"vtt"` | `"srt"` | 출력 자막 형식 |

## PNG 투명도 수정 {#png-transparency-fixer}

**도구 경로:** `transparency-fixer`  
**모델:** BiRefNet HR-매팅 (2048x2048 해상도)

배경은 제거되었지만 프린징, 헤일로, 반투명 아티팩트가 남은 "가짜 투명" PNG를 수정한다. BiRefNet의 고해상도 매팅 모델을 사용해 깨끗한 알파 채널을 만든 다음, 구성 가능한 디프린지 처리를 적용해 가장자리를 따라 남은 색상 오염을 제거한다.

**OOM 폴백 체인:** BiRefNet HR-매팅이 가용 메모리를 초과하면, 도구는 자동으로 `birefnet-general`로, 그다음 `u2net`로 폴백한다.

| 매개변수 | 타입 | 기본값 | 설명 |
|-----------|------|---------|-------------|
| `defringe` | number (0-100) | `30` | 색상 오염을 제거하는 가장자리 디프린지 강도 |
| `outputFormat` | `"png"` \| `"webp"` | `"png"` | 출력 이미지 형식 |
| `removeWatermark` | boolean | `false` | 워터마크 제거 사전 처리 적용 (미디안 필터) |

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/transparency-fixer \
  -H "Authorization: Bearer <token>" \
  -F "file=@fake-transparent.png" \
  -F 'settings={"defringe":30,"outputFormat":"png"}'
```

---

## 선택적 AI 기능을 갖춘 도구 {#tools-with-optional-ai-capabilities}

다음 도구는 Python 사이드카 도구는 아니지만 특정 옵션이 활성화되면 AI 기능을 사용한다.

### 이미지 향상 {#image-enhancement}

**도구 경로:** `image-enhancement`  
**엔진:** 분석 기반 (Sharp 히스토그램 및 통계)

이미지를 분석하여 노출, 대비, 화이트 밸런스, 채도, 선명도, 노이즈에 대한 자동 보정을 적용한다. 장면별 모드를 지원한다.

| 매개변수 | 타입 | 기본값 | 설명 |
|-----------|------|---------|-------------|
| `mode` | `"auto"` \| `"portrait"` \| `"landscape"` \| `"low-light"` \| `"food"` \| `"document"` | `"auto"` | 보정 튜닝용 장면 모드 |
| `intensity` | number (0-100) | `50` | 전체 보정 강도 |
| `corrections.exposure` | boolean | `true` | 노출 보정 적용 |
| `corrections.contrast` | boolean | `true` | 대비 보정 적용 |
| `corrections.whiteBalance` | boolean | `true` | 화이트 밸런스 보정 적용 |
| `corrections.saturation` | boolean | `true` | 채도 보정 적용 |
| `corrections.sharpness` | boolean | `true` | 선명도 보정 적용 |
| `corrections.denoise` | boolean | `true` | 노이즈 제거 적용 |
| `deepEnhance` | boolean | `false` | SCUNet을 통한 AI 노이즈 제거 활성화 (`upscale-enhance` 번들 필요) |

적용하지 않고 감지된 보정만 반환하는 추가 분석 엔드포인트를 `POST /api/v1/tools/image/image-enhancement/analyze`에서 사용할 수 있다.

### 콘텐츠 인식 크기 조정 (심 카빙) {#content-aware-resize-seam-carving}

**도구 경로:** `content-aware-resize`  
**엔진:** Go `caire` 바이너리 (Python이 아니므로 GPU 이점 없음)

저에너지 심을 제거하여 중요한 콘텐츠를 보존하면서 이미지 크기를 지능적으로 조정한다.

| 매개변수 | 타입 | 기본값 | 설명 |
|-----------|------|---------|-------------|
| `width` | number | - | 목표 너비 |
| `height` | number | - | 목표 높이 |
| `protectFaces` | boolean | `false` | 감지된 얼굴 영역 보호 (`face-detection` 번들 필요) |
| `blurRadius` | number (0-20) | `4` | 에너지 계산을 위한 사전 블러 |
| `sobelThreshold` | number (1-20) | `2` | 가장자리 민감도 임계값 |
| `square` | boolean | `false` | 정사각형 출력 강제 |
