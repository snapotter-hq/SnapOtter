---
description: "얼굴 감지, 배경 제거, 인쇄 시트 타일링을 갖춘 AI 기반 여권 및 신분증 사진 생성기."
i18n_source_hash: d4b4f4ced988
i18n_provenance: human
i18n_output_hash: ed3fcec68489
---

# Passport Photo {#passport-photo}

AI 기반 여권 및 신분증 사진 생성기. 2단계 워크플로: 분석(얼굴 감지 + 배경 제거) 후 생성(크롭, 크기 조정, 인쇄용 타일링).

## API Endpoints {#api-endpoints}

이 도구는 분석과 생성을 위한 별도의 엔드포인트를 사용하는 2단계 흐름을 사용합니다.

**Model bundles:** `background-removal` 및 `face-detection`

---

### Phase 1: Analyze {#phase-1-analyze}

`POST /api/v1/tools/image/passport-photo/analyze`

얼굴 랜드마크를 감지하고 배경을 제거합니다. 프런트엔드가 크롭 미리 보기를 표시할 수 있도록 랜드마크 데이터와 미리 보기를 반환합니다.

#### Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | 이미지 파일(multipart) |
| clientJobId | string | No | - | SSE를 통한 진행 상황 추적을 위한 선택적 작업 ID |

#### Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/passport-photo/analyze \
  -F "file=@headshot.jpg"
```

#### Response (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "filename": "headshot.jpg",
  "preview": "<base64-encoded PNG>",
  "previewWidth": 800,
  "previewHeight": 1067,
  "landmarks": {
    "leftEye": { "x": 0.42, "y": 0.35 },
    "rightEye": { "x": 0.58, "y": 0.35 },
    "eyeCenter": { "x": 0.50, "y": 0.35 },
    "chin": { "x": 0.50, "y": 0.65 },
    "forehead": { "x": 0.50, "y": 0.22 },
    "crown": { "x": 0.50, "y": 0.18 },
    "nose": { "x": 0.50, "y": 0.48 },
    "faceCenterX": 0.50
  },
  "imageWidth": 2400,
  "imageHeight": 3200
}
```

#### Progress (SSE, optional) {#progress-sse-optional}

`clientJobId`가 제공되면 진행 상황이 스트리밍됩니다(얼굴 감지 0~30%, 배경 제거 30~95%).

#### Error: No Face Detected (422) {#error-no-face-detected-422}

```json
{
  "error": "No face detected",
  "details": "Could not detect a face in the uploaded image. Please upload a clear, front-facing photo with good lighting."
}
```

---

### Phase 2: Generate {#phase-2-generate}

`POST /api/v1/tools/image/passport-photo/generate`

사진을 크롭, 크기 조정하고 선택적으로 인쇄 시트에 타일링합니다. Phase 1의 캐시된 이미지를 사용합니다(AI 재실행 없음).

#### Parameters (JSON body) {#parameters-json-body}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| jobId | string | Yes | - | Phase 1의 작업 ID |
| filename | string | Yes | - | Phase 1의 원본 파일 이름 |
| countryCode | string | Yes | - | 여권 사양을 위한 국가 코드(예: `US`, `GB`, `IN`) |
| documentType | string | No | `"passport"` | 문서 유형(국가 사양 기준) |
| bgColor | string | No | `"#FFFFFF"` | 배경 색상 hex |
| printLayout | string | No | `"none"` | 인쇄 용지 레이아웃: `none`, `4x6`, `a4` |
| maxFileSizeKb | number | No | `0` | 최대 파일 크기 제약(KB, 0 = 제한 없음) |
| dpi | number | No | `300` | 출력 DPI(72~1200) |
| customWidthMm | number | No | - | 사용자 지정 사진 너비(mm, 국가 사양 재정의) |
| customHeightMm | number | No | - | 사용자 지정 사진 높이(mm, 국가 사양 재정의) |
| zoom | number | No | `1` | 확대 계수(0.5~3). 1보다 큰 값은 더 타이트하게 크롭합니다 |
| adjustX | number | No | `0` | 가로 위치 조정 |
| adjustY | number | No | `0` | 세로 위치 조정 |
| landmarks | object | Yes | - | Phase 1 응답의 랜드마크 객체 |
| imageWidth | number | Yes | - | Phase 1 응답의 이미지 너비 |
| imageHeight | number | Yes | - | Phase 1 응답의 이미지 높이 |

#### Example Request {#example-request-1}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/passport-photo/generate \
  -H "Content-Type: application/json" \
  -d '{
    "jobId": "a1b2c3d4-...",
    "filename": "headshot.jpg",
    "countryCode": "US",
    "documentType": "passport",
    "bgColor": "#FFFFFF",
    "printLayout": "4x6",
    "dpi": 300,
    "zoom": 1,
    "adjustX": 0,
    "adjustY": 0,
    "landmarks": { "leftEye": {"x":0.42,"y":0.35}, "rightEye": {"x":0.58,"y":0.35}, "eyeCenter": {"x":0.50,"y":0.35}, "chin": {"x":0.50,"y":0.65}, "forehead": {"x":0.50,"y":0.22}, "crown": {"x":0.50,"y":0.18}, "nose": {"x":0.50,"y":0.48}, "faceCenterX": 0.50 },
    "imageWidth": 2400,
    "imageHeight": 3200
  }'
```

#### Response (200 OK) {#response-200-ok-1}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/headshot_passport.jpg",
  "dimensions": {
    "widthMm": 51,
    "heightMm": 51,
    "widthPx": 602,
    "heightPx": 602,
    "dpi": 300
  },
  "spec": {
    "country": "United States",
    "countryCode": "US",
    "documentType": "passport",
    "documentLabel": "Passport"
  },
  "printDownloadUrl": "/api/v1/download/{jobId}/headshot_passport_print_4x6.jpg"
}
```

---

### Base Route {#base-route}

`POST /api/v1/tools/image/passport-photo`

올바른 하위 엔드포인트를 사용하도록 안내를 반환합니다.

```json
{
  "error": "Use /api/v1/tools/image/passport-photo/analyze or /generate"
}
```

## Notes {#notes}

- `background-removal` 및 `face-detection` 모델 번들이 설치되어 있어야 합니다.
- Phase 1은 AI(얼굴 랜드마크 + 배경 제거)를 실행하고 결과를 캐시합니다. Phase 2는 순수한 Sharp 이미지 조작입니다(빠르며 AI가 필요 없음).
- 랜드마크는 정규화된 좌표(이미지 치수 기준 0~1 범위)로 반환됩니다.
- 분석 응답의 `preview` 필드는 빠른 표시를 위한 base64 인코딩 PNG(최대 너비 800px)입니다.
- 국가 사양에는 공식 여권 사진 요구 사항에 기반한 문서 치수, 머리 높이 비율, 눈 라인 위치가 포함됩니다.
- `printLayout` 옵션은 사진 사이에 2mm 여백을 두고 4x6\" 또는 A4 용지에 타일 시트를 생성합니다.
- `maxFileSizeKb`이 설정되면 출력이 크기 제한에 맞도록 반복적으로 압축됩니다.
