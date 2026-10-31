---
description: "편집기 또는 API를 통해 PDF의 페이지를 재정렬, 회전, 삭제하고 다른 PDF의 페이지를 가져옵니다."
i18n_source_hash: 4eca29216d15
i18n_provenance: machine
i18n_output_hash: 420e406a90a7
i18n_hash_version: 2
---

# PDF 멀티 도구 {#multi-tool-pdf}

명시적인 페이지 계획으로 PDF를 조립합니다: 페이지를 재정렬, 복제, 회전 또는 삭제하고, 추가 PDF에서 페이지를 가져와 한 번의 요청으로 모두 처리합니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/pdf/multi-tool-pdf`

하나 이상의 PDF 파일과 JSON `settings` 필드가 포함된 multipart form data를 받습니다.
요청당 최대 20개의 입력 문서와 1,200개의 출력 페이지를 지원합니다.

## 매개변수 {#parameters}

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| items | array | Yes | 출력 순서대로 정리한 페이지 계획입니다. 각 항목은 `{ "doc": <int>, "page": <int>, "rot": <90\|180\|270, optional> }`입니다. `doc`는 업로드 순서대로 입력 파일을 가리키는 0부터 시작하는 인덱스이고, `page`는 해당 문서에서 1부터 시작하는 페이지 번호입니다. |
| pageCounts | array | Yes | 각 업로드 문서의 실제 페이지 수를 같은 순서로 나열합니다. 문서의 페이지 수를 초과하는 계획 페이지는 400으로 거부됩니다. |

## 요청 예시 {#example-request}

첫 번째 문서의 3페이지와 1페이지, 이어서 두 번째 문서의 1페이지와 2페이지를 가져오고, 첫 번째 출력 페이지를 시계 방향으로 90° 회전합니다:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/multi-tool-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F "file=@extra.pdf" \
  -F 'settings={"items":[{"doc":0,"page":3,"rot":90},{"doc":0,"page":1},{"doc":1,"page":1},{"doc":1,"page":2}],"pageCounts":[3,2]}'
```

## 응답 예시 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document_multi-tool.pdf",
  "originalSize": 2450000,
  "processedSize": 2450000
}
```

## 참고 사항 {#notes}

- 같은 페이지를 `items`에 여러 번 넣어 복제할 수 있습니다.
- `items`에 포함되지 않은 페이지는 출력에서 제외됩니다.
- `rot`는 복사된 페이지에 새로운 표시 방향을 기록합니다(기존 회전과 합성됨). 페이지 내용은 변경되지 않습니다.
- 회전은 출력 복사본마다 적용되므로, 복제본마다 다른 회전을 줄 수 있습니다.
- 출력은 새로운 평면 문서이며, 원본의 북마크와 문서 수준 메타데이터는 유지되지 않습니다.
- 처리에는 qpdf 바이너리가 필요하며, 공식 Docker 이미지에 포함되어 있습니다.
