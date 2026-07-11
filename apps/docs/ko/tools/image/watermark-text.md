---
description: "구성 가능한 위치, 불투명도, 회전, 타일링으로 텍스트 워터마크를 추가합니다."
i18n_source_hash: b80f12f410e4
i18n_provenance: human
i18n_output_hash: 99f9b8d3da11
---

# Text Watermark {#text-watermark}

이미지에 텍스트 워터마크 오버레이를 추가합니다. 모서리/중앙 단일 배치 또는 전체 이미지에 걸친 타일 반복을 지원하며, 구성 가능한 글꼴 크기, 색상, 불투명도, 회전을 제공합니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/watermark-text`

이미지 파일과 JSON `settings` 필드를 담은 multipart form data를 받습니다.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| text | string | Yes | - | 워터마크 텍스트 (1 ~ 500자) |
| fontSize | number | No | `48` | 글꼴 크기(픽셀) (8 ~ 1000) |
| color | string | No | `"#000000"` | 텍스트 색상(hex 형식, `#RRGGBB`) |
| opacity | number | No | `50` | 텍스트 불투명도 백분율 (0 ~ 100) |
| position | string | No | `"center"` | 배치: `center`, `top-left`, `top-right`, `bottom-left`, `bottom-right`, `tiled` |
| rotation | number | No | `0` | 텍스트 회전 각도(도) (-360 ~ 360) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/watermark-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "SAMPLE", "fontSize": 64, "opacity": 30, "position": "center", "rotation": -30}'
```

전체 이미지에 걸친 타일 워터마크:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/watermark-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "DRAFT", "fontSize": 36, "opacity": 20, "position": "tiled", "rotation": -45}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2480000
}
```

## Notes {#notes}

- 워터마크는 SVG 텍스트로 렌더링되어 이미지에 합성되므로 출력 품질이 보존됩니다.
- 타일 모드는 글꼴 크기를 기준으로 텍스트 요소의 간격을 정하며(가로 6배, 세로 4배 간격), 최대 500개 요소로 제한됩니다.
- 모서리 위치의 경우 가장자리로부터의 여백은 글꼴 크기와 같습니다.
- 사용되는 글꼴은 시스템의 기본 sans-serif 글꼴입니다.
- 텍스트의 XML 특수 문자(`&`, `<`, `>`, `"`, `'`)는 안전하게 이스케이프됩니다.
- 출력 형식은 입력 형식과 일치합니다. HEIC, RAW, PSD, SVG 입력은 처리 전에 자동으로 디코딩됩니다.
