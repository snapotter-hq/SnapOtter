---
description: "PDF의 모든 페이지에 페이지 번호를 추가합니다."
i18n_source_hash: 58342d6ac8d2
i18n_provenance: human
i18n_output_hash: c049ab379e54
---

# PDF Page Numbers {#pdf-page-numbers}

PDF의 모든 페이지에 "Page N of M" 페이지 번호를 추가합니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-page-numbers`

PDF 파일과 JSON `settings` 필드가 포함된 multipart form data를 받습니다.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| position | string | No | `"bc"` | 페이지 번호 위치: `bl`, `bc`, `br`, `tl`, `tc`, `tr` |
| fontSize | integer | No | `10` | 글꼴 크기(포인트, 6-24) |

### Position Values {#position-values}

- `tl` 왼쪽 위, `tc` 가운데 위, `tr` 오른쪽 위
- `bl` 왼쪽 아래, `bc` 가운데 아래, `br` 오른쪽 아래

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-page-numbers \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"position": "bc", "fontSize": 12}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2470000
}
```

## Notes {#notes}

- 페이지 번호는 "Page 1 of 10" 형식으로 렌더링됩니다.
- 기존의 제목 페이지나 표지 페이지를 포함해 모든 페이지에 번호가 추가됩니다.
- 기본 위치 `"bc"`은(는) 각 페이지의 가운데 아래에 번호를 배치합니다.
