---
description: "PDF의 모든 페이지를 A4, Letter, 4x6 in 배송 라벨 또는 사용자 지정 크기로 조정합니다."
i18n_source_hash: 9db88016c07b
i18n_provenance: machine
i18n_output_hash: 3b6fdf9271ea
i18n_hash_version: 2
---

# Resize PDF Pages {#resize-pdf-pages}

PDF의 모든 페이지 크기를 변경합니다. 내용은 새 페이지에 맞게 크기가 조정되어 가운데에 배치되므로 텍스트, 벡터 아트, 바코드가 선명하게 유지됩니다. 배송 라벨을 감열 프린터용 4x6 in 페이지로 만들거나 문서를 A4와 US Letter 사이에서 옮길 때 사용하세요.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/resize-pdf-pages`

PDF 파일과 JSON `settings` 필드를 담은 multipart form data를 받습니다.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| pageSize | string | No | `"4x6in"` | 대상 크기: `4x6in`, `100x150mm`, `a4`, `a5`, `a6`, `letter`, `legal` 또는 `custom` |
| width | number | No | `4` | 사용자 지정 페이지 너비. `pageSize`이(가) `custom`일 때 사용됩니다 |
| height | number | No | `6` | 사용자 지정 페이지 높이. `pageSize`이(가) `custom`일 때 사용됩니다 |
| unit | string | No | `"in"` | 사용자 지정 크기의 단위: `in` 또는 `mm` |
| keepOrientation | boolean | No | `false` | 너비 x 높이를 고정하지 않고, 각 페이지의 방향에 맞게 대상 크기를 회전합니다 |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/resize-pdf-pages \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@label.pdf" \
  -F 'settings={"pageSize": "4x6in"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/label_resized.pdf",
  "originalSize": 84200,
  "processedSize": 85100
}
```

## Notes {#notes}

- 페이지는 맞게 크기가 조정되며 늘어나지 않습니다. 가로세로 비율이 다르면 남는 공간은 비워 둡니다.
- 크기를 조정해도 잘라내지는 않습니다. Letter나 A4 페이지의 4분의 1에 인쇄된 라벨은 새 페이지에서도 4분의 1만 차지합니다.
- 사용자 지정 크기는 각 변이 0.5-200 in(12.7-5080 mm)이어야 합니다.
- 페이지에 크롭 박스가 있으면 이를 기준으로 크기를 조정하므로, 잘라낸 페이지에는 잘라낸 영역만 남습니다.
