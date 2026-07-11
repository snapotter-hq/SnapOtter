---
description: "템플릿이나 사용자 지정 이미지, 스타일이 적용된 텍스트 상자, 글꼴 옵션으로 밈을 만듭니다."
i18n_source_hash: 0a4970112ca6
i18n_provenance: human
i18n_output_hash: ed77c914f4c5
---

# Meme Generator {#meme-generator}

내장 템플릿이나 사용자 지정 이미지를 사용해 밈을 만듭니다. 고전적인 밈 스타일(굵고 외곽선이 있는 텍스트), 여러 레이아웃 프리셋, 글꼴 선택으로 텍스트를 추가합니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/meme-generator`

다음 중 하나를 허용합니다:
- **Multipart form data**: 이미지 파일과 JSON `settings` 필드(사용자 지정 이미지 모드)
- **JSON body**: `templateId`(템플릿 모드, 파일 업로드 불필요)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| templateId | string | No | - | 내장 밈 템플릿 ID. 제공되면 이미지 업로드가 필요 없습니다 |
| textLayout | string | No | `"top-bottom"` | 텍스트 상자 레이아웃: `top-bottom`, `top-only`, `bottom-only`, `center`, `side-by-side` |
| textBoxes | array | No | `[]` | `id` 및 `text` 필드를 가진 텍스트 상자 객체 배열 |
| fontFamily | string | No | `"anton"` | 글꼴: `anton`, `arial-black`, `comic-sans`, `montserrat`, `bebas-neue`, `permanent-marker`, `roboto` |
| fontSize | number | No | auto | 글꼴 크기(픽셀, 8~200). 생략하면 자동 계산됩니다 |
| textColor | string | No | `"#ffffff"` | 텍스트 채우기 색상 |
| strokeColor | string | No | `"#000000"` | 텍스트 외곽선 색상 |
| textAlign | string | No | `"center"` | 텍스트 정렬: `left`, `center`, `right` |
| allCaps | boolean | No | `true` | 텍스트를 대문자로 변환 |

### Text Boxes {#text-boxes}

`textBoxes` 배열의 각 항목은 다음을 가져야 합니다:

| Field | Type | Description |
|-------|------|-------------|
| id | string | 레이아웃과 일치하는 상자 식별자(예: `"top"`, `"bottom"`, `"left"`, `"right"`, `"center"`) |
| text | string | 표시할 밈 텍스트 |

### Text Layout Box IDs {#text-layout-box-ids}

| Layout | Available Box IDs |
|--------|-------------------|
| `top-bottom` | `top`, `bottom` |
| `top-only` | `top` |
| `bottom-only` | `bottom` |
| `center` | `center` |
| `side-by-side` | `left`, `right` |

## Example Request {#example-request}

상단과 하단 텍스트가 있는 사용자 지정 이미지:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/meme-generator \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"textLayout": "top-bottom", "textBoxes": [{"id": "top", "text": "When the code works"}, {"id": "bottom", "text": "On the first try"}], "fontFamily": "anton", "allCaps": true}'
```

내장 템플릿 사용(JSON body, 파일 업로드 없음):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/meme-generator \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"templateId": "drake", "textBoxes": [{"id": "top", "text": "Manual testing"}, {"id": "bottom", "text": "Automated tests"}]}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/meme-drake.png",
  "originalSize": 450000,
  "processedSize": 520000
}
```

## Notes {#notes}

- `templateId` 또는 업로드된 이미지 파일 중 하나가 필요합니다. 둘 다 제공하면 템플릿이 사용됩니다.
- 템플릿은 자체 텍스트 상자 위치를 정의합니다. 템플릿을 사용할 때는 `textLayout` 매개변수가 무시됩니다.
- 텍스트는 고전적인 밈 느낌을 위해 외곽선이 있는 SVG로 렌더링됩니다.
- 글꼴 크기를 명시적으로 설정하지 않으면 텍스트 상자에 맞게 자동 계산됩니다.
- 빈 텍스트 상자는 건너뜁니다(모든 상자가 비어 있으면 렌더링이 발생하지 않습니다).
- 템플릿을 사용할 때 출력 파일 이름에는 템플릿 ID가 포함됩니다(예: `meme-drake.png`).
- HEIC, RAW, PSD, SVG 입력은 처리 전에 자동으로 디코딩됩니다.
