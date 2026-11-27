---
description: "PDF 문서 메타데이터를 읽고 씁니다."
i18n_source_hash: 11de4f7991e4
i18n_provenance: machine
i18n_output_hash: 3f87db6f541b
i18n_hash_version: 2
---

# PDF Metadata {#pdf-metadata}

제목, 작성자, 주제, 키워드 같은 PDF 문서 메타데이터 필드를 읽고 업데이트하거나, 문서의 메타데이터를 완전히 제거합니다. 설정을 제공하지 않으면 기존 메타데이터가 수정 없이 반환됩니다.

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
| stripAll | boolean | No | false | Info 딕셔너리 전체(날짜, Creator, Producer, 사용자 정의 키), 모든 XMP 스트림(문서, 페이지, 이미지), 모든 PieceInfo 애플리케이션 데이터를 제거한 뒤, 위에 지정한 필드를 기록 |
| removeAttachments | boolean | No | false | 내장 파일도 함께 제거: 문서의 첨부 파일 목록, 파일 첨부 주석, 연관 파일(`/AF`). `stripAll`가 필요 |

모든 매개변수는 선택 사항입니다. 생략된 필드는 `stripAll`가 설정되지 않은 한 변경되지 않습니다.

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
- `stripAll`를 사용하면 응답에 `stripped`도 포함됩니다. 제거된 Info 키(`removed`), 문서 XMP 스트림 제거 여부(`xmpRemoved`), 입력이 선언한 PDF/A 수준(`pdfa` 또는 `null`), 페이지, 이미지 및 기타 객체에서 제거된 XMP 스트림 수(`objectXmpRemoved`), 제거된 PieceInfo 딕셔너리 수(`pieceInfoRemoved`), 제거된 내장 파일 수(`attachmentsRemoved`, `removeAttachments` 없이는 항상 `0`)가 그것입니다. XMP를 제거하면 PDF/A 준수가 깨집니다.
- `stripAll`만 사용하면 내장 파일 첨부는 유지됩니다. 첨부를 제거하면 문서 내용이 바뀌기 때문입니다. 첨부까지 제거하려면 `removeAttachments`를 추가하세요. 그러면 ZUGFeRD 및 Factur-X 전자 청구서에 첨부된 XML이 제거되고 PDF/A-3 준수가 깨집니다.
- `stripAll` 없이 `removeAttachments`를 보내면 400을 반환합니다.
