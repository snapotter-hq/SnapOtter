---
description: "페이지를 추출하거나 PDF를 여러 부분으로 분할합니다."
i18n_source_hash: 5c8d8041d219
i18n_provenance: human
i18n_output_hash: 73639f25fa10
---

# Split PDF {#split-pdf}

페이지 범위를 새 PDF로 추출하거나, 문서를 N페이지 단위로 분할합니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/split-pdf`

PDF 파일과 JSON `settings` 필드가 포함된 multipart form data를 받습니다.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"range"` | 분할 모드: `range` 또는 `every` |
| range | string | mode가 `range`일 때 | - | qpdf 문법의 페이지 범위, 예: `"1-5,8,10-z"` |
| everyN | integer | mode가 `every`일 때 | - | N페이지 단위로 분할(1-500) |

## Example Request {#example-request}

특정 페이지 추출:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/split-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "range", "range": "1-5,8"}'
```

10페이지 단위로 분할:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/split-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "every", "everyN": 10}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 980000
}
```

## Notes {#notes}

- `range` 모드에서는 선택한 페이지가 담긴 단일 PDF가 반환됩니다.
- `every` 모드에서는 개별 부분들이 담긴 ZIP 아카이브가 결과로 반환됩니다.
- 페이지 범위는 qpdf 문법을 사용합니다: 1페이지부터 5페이지까지는 `1-5`, 마지막 페이지는 `z`, 그리고 쉼표로 범위를 결합합니다(예: `1-3,7,10-z`).
