---
description: "PDF의 모든 페이지에 텍스트 워터마크를 추가합니다."
i18n_source_hash: f1f7d8912fbd
i18n_provenance: human
i18n_output_hash: 893a002081ec
---

# Watermark PDF {#watermark-pdf}

위치, 크기, 불투명도, 회전을 구성할 수 있는 텍스트 워터마크를 PDF의 모든 페이지에 스탬프합니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/watermark-pdf`

PDF 파일과 JSON `settings` 필드가 포함된 multipart form data를 받습니다.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| text | string | Yes | - | 워터마크 텍스트 (1-200자) |
| position | string | No | `"c"` | 페이지 내 위치: `tl`, `tc`, `tr`, `l`, `c`, `r`, `bl`, `bc`, `br` |
| fontSize | integer | No | `48` | 글꼴 크기(포인트, 6-72) |
| opacity | number | No | `0.3` | 워터마크 불투명도(0.05-1) |
| rotation | number | No | `45` | 회전 각도(도 단위, -180에서 180) |

### Position Values {#position-values}

- `tl` 왼쪽 위, `tc` 가운데 위, `tr` 오른쪽 위
- `l` 왼쪽 가운데, `c` 가운데, `r` 오른쪽 가운데
- `bl` 왼쪽 아래, `bc` 가운데 아래, `br` 오른쪽 아래

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/watermark-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"text": "CONFIDENTIAL", "position": "c", "opacity": 0.2, "rotation": 45}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2500000
}
```

## Notes {#notes}

- 워터마크는 각 페이지에 텍스트 오버레이로 렌더링됩니다.
- 동일한 워터마크 텍스트, 위치, 스타일이 모든 페이지에 균일하게 적용됩니다.
- 콘텐츠를 가리지 않는 은은한 워터마크를 원하면 낮은 불투명도 값(0.1-0.3)을 사용하세요.
