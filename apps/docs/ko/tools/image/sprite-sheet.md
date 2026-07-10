---
description: "여러 이미지를 하나의 스프라이트 시트 격자로 결합하며 프레임 메타데이터를 제공합니다."
i18n_source_hash: 1938d7fb100d
i18n_provenance: human
i18n_output_hash: afeedde0c38a
---

# Sprite Sheet {#sprite-sheet}

여러 이미지를 하나의 스프라이트 시트 격자로 결합합니다. 각 이미지는 첫 번째 이미지의 크기에 맞게 리사이즈되어 격자에 배치됩니다. 스프라이트 시트 이미지와 함께 프레임별 좌표 메타데이터를 반환합니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/sprite-sheet`

두 개 이상의 이미지 파일과 JSON `settings` 필드를 담은 multipart form data를 받습니다.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| columns | integer | No | `4` | 격자의 열 개수 (1-16) |
| padding | integer | No | `0` | 셀 사이 여백(픽셀) (0-64) |
| background | string | No | `"#ffffff"` | 배경 hex 색상 |
| format | string | No | `"png"` | 출력 형식: `png`, `webp`, 또는 `jpeg` |
| quality | integer | No | `90` | 출력 품질 (1-100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/sprite-sheet \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@frame1.png" \
  -F "file=@frame2.png" \
  -F "file=@frame3.png" \
  -F "file=@frame4.png" \
  -F 'settings={"columns": 2, "padding": 4, "format": "png"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/sprite-sheet.png",
  "originalSize": 120000,
  "processedSize": 95000,
  "frames": [
    { "index": 0, "left": 0, "top": 0, "width": 128, "height": 128 },
    { "index": 1, "left": 132, "top": 0, "width": 128, "height": 128 },
    { "index": 2, "left": 0, "top": 132, "width": 128, "height": 128 },
    { "index": 3, "left": 132, "top": 132, "width": 128, "height": 128 }
  ],
  "cols": 2,
  "rows": 2,
  "cellWidth": 128,
  "cellHeight": 128,
  "canvasWidth": 260,
  "canvasHeight": 260
}
```

## Notes {#notes}

- 2개에서 64개의 이미지를 받습니다. 모든 이미지는 첫 번째로 업로드된 이미지의 크기에 맞게 리사이즈됩니다.
- `frames` 배열은 출력에서 각 프레임의 정확한 픽셀 좌표를 제공하며, CSS 스프라이트 정의나 게임 엔진 프레임 맵에 적합합니다.
- 행 개수는 이미지 개수와 `columns` 값으로부터 자동으로 계산됩니다.
- `padding` 파라미터를 사용해 셀 사이에 간격을 추가하세요. `background` 색상은 여백 영역과 비어 있는 후행 셀에서 보입니다.
- HEIC, RAW, PSD, SVG 입력은 처리 전에 자동으로 디코딩됩니다.
