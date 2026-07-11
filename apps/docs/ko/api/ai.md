---
description: "모든 로컬 ML 도구를 다루는 AI 엔진 레퍼런스. 배경 제거, 업스케일링, OCR, 얼굴 감지, 사진 복원 등."
i18n_source_hash: 14728c1dcd05
i18n_provenance: machine
i18n_output_hash: 0345ba8791f7
---

# AI 엔진 레퍼런스 {#ai-engine-reference}

`@snapotter/ai` 패키지는 모든 ML 작업을 위해 Node.js와 **상시 실행되는 Python 사이드카**를 연결한다. 디스패처 프로세스는 요청 사이에도 살아 있어 빠른 웜 스타트 성능을 낸다. NVIDIA CUDA는 시작 시 자동으로 감지되어 사용 가능하면 사용되고, 그렇지 않으면 AI 도구가 CPU에서 실행된다.

VA-API, Quick Sync, OpenCL을 통한 Intel/AMD iGPU 가속은 현재 AI 추론에 지원되지 않는다. CUDA를 지원하는 NVIDIA GPU가 없는 한, 컨테이너에 `/dev/dri`를 매핑해도 이러한 Python 사이드카 도구는 가속되지 않는다.

네 가지 모달리티(이미지, 오디오, 비디오, 문서)에 걸쳐 19개의 Python 사이드카 AI 도구가 있으며, 여기에 선택적 AI 기능을 갖춘 2개의 도구가 추가된다. 모든 모델은 로컬에서 실행되며, 최초 모델 다운로드 이후에는 인터넷이 필요하지 않다.

## 아키텍처 {#architecture}

```
Node.js Tool Route
      |
      v
 @snapotter/ai bridge.ts
      | (stdin/stdout JSON + stderr progress events)
      v
 Python dispatcher (persistent process, "ai" profile)
      |
      |-- remove_bg.py        (rembg / BiRefNet)
      |-- upscale.py          (RealESRGAN)
      |-- inpaint.py          (LaMa ONNX)
      |-- outpaint.py         (LaMa canvas expansion)
      |-- ocr.py              (PaddleOCR / Tesseract)
      |-- ocr_pdf.py          (page-by-page document OCR)
      |-- ocr_preprocess.py   (image enhancement for OCR)
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

각 AI 도구는 실행되기 전에 하나 이상의 기능 번들이 필요하다. 관리자 UI는 `POST /api/v1/admin/tools/:toolId/features/install`을 통해 도구 단위로 설치하며, 이는 전체 번들 목록을 해석하고, 이미 설치된 번들은 건너뛰며, 누락된 다운로드만 대기열에 넣는다. 예를 들어, 새 인스턴스에서 여권 사진을 활성화하면 `background-removal`와 `face-detection`가 대기열에 들어가고, 배경 제거가 이미 설치된 상태에서 활성화하면 `face-detection`만 대기열에 들어간다.

| 번들 | 크기 | 공유 의존성 그룹 | 사용하는 도구 |
|--------|------|-------------------------|-------------------|
| `background-removal` | 4-5 GB | rembg / BiRefNet 배경 매팅 | remove-background, passport-photo, transparency-fixer, background-replace, blur-background |
| `face-detection` | 200-300 MB | MediaPipe 얼굴 감지 및 랜드마크 | blur-faces, red-eye-removal, smart-crop |
| `object-eraser-colorize` | 1-2 GB | LaMa 인페인팅/아웃페인팅 및 DDColor | erase-object, colorize, ai-canvas-expand |
| `upscale-enhance` | 5-6 GB | RealESRGAN, GFPGAN / CodeFormer, 노이즈 제거 | upscale, enhance-faces, noise-removal |
| `photo-restoration` | 4-5 GB | 스크래치 복구 및 복원 파이프라인 | restore-photo |
| `ocr` | 5-6 GB | PaddleOCR / Tesseract OCR 스택 | ocr, ocr-pdf |
| `transcription` | ~600 MB | faster-whisper 음성-텍스트 변환 모델 | transcribe-audio, auto-subtitles |

교차 번들 의존성을 갖는 도구:

| 도구 | 필요한 번들 | 이유 |
|------|------------------|-----|
| `passport-photo` | `background-removal`, `face-detection` | 배경을 제거한 뒤, 얼굴 랜드마크를 사용해 여권 및 신분증 사진 규정에 맞게 크롭 구도를 잡는다. |
| `enhance-faces` | `upscale-enhance`, `face-detection` | 선택된 얼굴 영역에 GFPGAN 또는 CodeFormer 보정을 적용하기 전에 얼굴을 감지한다. |

도구는 필요한 모든 번들이 설치되어 있을 때만 사용할 수 있다. 부분 설치도 유효하며 점진적으로 처리된다. 설치된 번들은 재사용되고, 누락된 번들은 다운로드로 표시되며, 대기 중인 설치는 한 번에 하나씩 실행되어 공유 Python 환경이 동시에 수정되지 않도록 한다.

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
**모델:** Tesseract (빠름), PaddleOCR PP-OCRv5 (균형), PaddleOCR-VL 1.5 (최상)

| 매개변수 | 타입 | 기본값 | 설명 |
|-----------|------|---------|-------------|
| `quality` | `"fast"` \| `"balanced"` \| `"best"` | `"balanced"` | 처리 등급 |
| `language` | string | `"auto"` | 언어: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| `enhance` | boolean | `true` | OCR 정확도 향상을 위해 이미지 사전 처리 |
| `engine` | string | - | 사용 중단됨. `tesseract`을 `fast`로, `paddleocr`을 `balanced`로 매핑 |

경계 상자, 신뢰도 점수, 추출된 텍스트 블록을 포함한 구조화된 결과를 반환한다.

## PDF OCR {#pdf-ocr}

**도구 경로:** `ocr-pdf`  
**모델:** 이미지 OCR와 동일한 등급 체계

AI 기반 OCR을 사용해 스캔된 PDF 문서에서 페이지별로 텍스트를 추출한다.

| 매개변수 | 타입 | 기본값 | 설명 |
|-----------|------|---------|-------------|
| `quality` | `"fast"` \| `"balanced"` \| `"best"` | `"balanced"` | 처리 등급 |
| `language` | string | `"auto"` | 언어: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| `pages` | string | `"all"` | 페이지 선택: `"all"`, `"1-3"`, `"1,3,5"` |

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
