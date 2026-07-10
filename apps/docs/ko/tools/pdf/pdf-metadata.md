---
description: "PDF 문서 메타데이터를 읽고 씁니다."
i18n_source_hash: b2eaebf7467f
i18n_provenance: human
i18n_output_hash: 44b1ee802252
---

# PDF Metadata {#pdf-metadata}

제목, 작성자, 주제, 키워드 같은 PDF 문서 메타데이터 필드를 읽고 업데이트합니다. 설정을 제공하지 않으면 기존 메타데이터가 수정 없이 반환됩니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-metadata`

PDF 파일과 선택적 JSON `settings` 필드가 포함된 multipart form data를 받습니다.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| title | string | No | - | 문서 제목 (최대 500자) |
| author | string | No | - | 문서 작성자 (최대 500자) |
| subject | string | No | - | 문서 주제 (최대 500자) |
| keywords | string | No | - | 문서 키워드 (최대 500자) |

모든 매개변수는 선택 사항입니다. 생략된 필드는 변경되지 않습니다.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf" \
  -F 'settings={"title": "Q2 Report", "author": "Finance Team"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.pdf",
  "originalSize": 245000,
  "processedSize": 245200,
  "metadata": {
    "title": "Q2 Report",
    "author": "Finance Team",
    "subject": "",
    "keywords": ""
  }
}
```

## Notes {#notes}

- 허용되는 입력 형식: `.pdf`.
- 이 도구는 결과를 직접 반환하는 빠른(동기) 도구입니다.
- 응답의 `metadata` 필드에는 업데이트 후 결과 메타데이터가 담겨 있습니다.
- 메타데이터를 수정하지 않고 읽으려면 `settings` 필드를 생략하거나 빈 객체를 보내세요.
- 각 메타데이터 필드는 500자로 제한됩니다.
