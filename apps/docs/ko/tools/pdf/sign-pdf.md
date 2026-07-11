---
description: "정규화된 페이지 배치를 사용하여 업로드한 서명 이미지를 PDF에 스탬프합니다."
i18n_source_hash: c28f78c2e7fd
i18n_provenance: human
i18n_output_hash: 100625cb01dc
---

# Sign PDF {#sign-pdf}

업로드한 하나 이상의 서명 PNG 이미지를 PDF의 아무 페이지에나 스탬프합니다. 이 경로는 PDF, 하나 이상의 서명 이미지, 그리고 배치 좌표가 필요하기 때문에 사용자 지정 multipart 계약을 사용합니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/sign-pdf`

multipart form data를 받습니다. PDF는 `file`로 전송되고, 서명은 `sig0`, `sig1` 등으로 전송되며, 배치는 `placements` JSON 필드로 전송됩니다.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | 서명할 PDF 파일 |
| sig0 | file | Yes | - | 첫 번째 서명 이미지. 추가 이미지는 `sig1`, `sig2` 등을 사용합니다 |
| placements | JSON string | Yes | - | 배치 객체 배열: `{ "sig": 0, "page": 0, "x": 0.2, "y": 0.7, "w": 0.25, "h": 0.08 }` |
| clientJobId | string | No | - | SSE를 통한 진행 상황 추적을 위한 선택적 UUID |
| fileId | string | No | - | 서명된 결과를 새 버전으로 저장하기 위한 선택적 파일 라이브러리 ID |

## Placement Coordinates {#placement-coordinates}

| Field | Type | Description |
|-------|------|-------------|
| sig | integer | 서명 이미지 인덱스. `0`은(는) `sig0`에 매핑됩니다 |
| page | integer | 0부터 시작하는 PDF 페이지 인덱스 |
| x | number | 페이지 비율로 표현한 왼쪽 위치 |
| y | number | 페이지 비율로 표현한 위쪽 위치 |
| w | number | 페이지 비율로 표현한 서명 너비 |
| h | number | 페이지 비율로 표현한 서명 높이 |

좌표는 왼쪽 위 원점을 사용합니다. 값이 페이지 가장자리를 약간 벗어날 수 있으며, PDF 렌더러가 최종 스탬프를 페이지에 맞게 잘라냅니다.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/sign-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@contract.pdf" \
  -F "sig0=@signature.png" \
  -F 'placements=[{"sig":0,"page":0,"x":0.64,"y":0.82,"w":0.22,"h":0.08}]'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/contract_signed.pdf",
  "previewUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/preview.png",
  "originalSize": 245000,
  "processedSize": 249000
}
```

요청이 동기 대기 창 내에 완료되지 못하면 API는 다음을 반환합니다:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

`/api/v1/jobs/<jobId>/progress`에 연결하여 작업이 완료되면 결과를 다운로드하세요.

## Notes {#notes}

- 허용되는 PDF 입력 형식: `.pdf`.
- 서명 이미지는 유효한 이미지 파일이어야 하며, 일반적으로 투명도가 있는 PNG입니다.
- 최대 100개의 서명 이미지와 100개의 배치가 허용됩니다.
- `sign-pdf`은(는) 사용자 지정 경로이며 표준 도구 `settings` JSON 필드를 사용하지 않습니다.
