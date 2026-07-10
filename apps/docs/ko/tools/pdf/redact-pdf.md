---
description: "PDF에서 텍스트 항목을 영구적으로 제거합니다(검증된 실제 마스킹)."
i18n_source_hash: 296ad2a701b2
i18n_provenance: human
i18n_output_hash: 7119219b9b55
---

# Redact PDF {#redact-pdf}

검증된 실제 마스킹을 사용하여 지정된 텍스트 항목을 PDF에서 영구적으로 제거합니다. 마스킹된 텍스트는 검은 상자로 덮이는 것이 아니라 파일에서 완전히 제거됩니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/redact-pdf`

PDF 파일과 JSON `settings` 필드가 포함된 multipart form data를 받습니다.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| terms | string[] | Yes | - | 마스킹할 텍스트 문자열 (1-50개 항목, 각각 최대 200자) |
| caseSensitive | boolean | No | `false` | 대소문자를 구분하여 일치시킬지 여부 |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/redact-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@contract.pdf" \
  -F 'settings={"terms": ["John Doe", "555-0123"], "caseSensitive": false}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/contract.pdf",
  "originalSize": 245000,
  "processedSize": 243000,
  "found": 7
}
```

## Notes {#notes}

- 허용되는 입력 형식: `.pdf`.
- 이 도구는 결과를 직접 반환하는 빠른(동기) 도구입니다.
- 이 도구는 실제 마스킹을 수행합니다: 일치하는 텍스트는 시각적으로 가려지는 것이 아니라 PDF 콘텐츠 스트림에서 제거됩니다.
- 응답의 `found` 필드는 몇 개의 항목이 마스킹되었는지 나타냅니다.
- 단일 요청에서 최대 50개의 항목을 마스킹할 수 있습니다.
