---
description: "모든 가장자리에 같은 여백, 가장자리별 여백 또는 특정 영역으로 PDF의 모든 페이지를 자릅니다."
i18n_source_hash: 338ff7bb64e5
i18n_provenance: machine
i18n_output_hash: 0a9355c08562
i18n_hash_version: 2
---

# Crop PDF {#crop-pdf}

모든 가장자리에 하나의 여백을 적용하거나, 가장자리별로 따로 여백을 지정하거나, 용지 한쪽 모서리에 인쇄된 배송 라벨 같은 영역만 남기도록 PDF의 모든 페이지를 자릅니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/crop-pdf`

PDF 파일과 JSON `settings` 필드가 포함된 multipart form data를 받습니다.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `uniform` | `uniform`, `sides` 또는 `region` |
| margin | number | No | `20` | `uniform` 모드: 모든 가장자리의 자르기 여백(포인트 단위, 0-2000) |
| top, right, bottom, left | number | No | `0` | `sides` 모드: 각 가장자리의 자르기 여백(포인트 단위, 0-2000) |
| x, y | number | No | `0` | `region` 모드: 페이지의 왼쪽 및 위쪽 가장자리에서 영역까지의 오프셋(포인트 단위) |
| width, height | number | No | `288`, `432` | `region` 모드: 영역의 크기(포인트 단위, 4x6 in 라벨) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/crop-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"margin": 50}'
```

각 페이지의 왼쪽 위 모서리에 있는 4x6 in 라벨만 남깁니다.

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/crop-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@label.pdf" \
  -F 'settings={"mode": "region", "x": 0, "y": 0, "width": 288, "height": 432}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2440000
}
```

## Notes {#notes}

- 모든 값은 PDF 포인트 단위입니다(1포인트 = 1/72인치). US Letter 페이지는 612 x 792포인트입니다.
- 각 모드는 자기 필드만 읽으므로 `margin`만 보내는 요청도 계속 동작합니다.
- 영역은 각 페이지의 왼쪽 위 모서리부터 측정하며 모든 페이지 안에 들어와야 합니다. 여백은 각 페이지의 일부가 남도록 지정해야 합니다. 그렇지 않으면 요청이 `400` 오류로 실패합니다.
- 회전된 상태로 표시되도록 설정된 페이지에서는 위치와 가장자리가 표시되는 그대로의 페이지를 기준으로 하므로, 영역의 왼쪽 위 모서리는 회전된 페이지의 왼쪽 위 모서리입니다.
- 모든 모드는 전체 media box를 기준으로 측정하므로, 이미 잘린 페이지를 다시 자르면 전체 페이지에서 다시 시작합니다. `0` 값의 균일한 여백은 전체 media box를 표시합니다.
