---
description: "임의의 각도로 이미지를 회전하고 가로 또는 세로로 뒤집습니다."
i18n_source_hash: c4ed5f7e270b
i18n_provenance: human
i18n_output_hash: 20d61f10ef3e
---

# 이미지 회전 및 뒤집기 {#rotate-flip}

임의의 각도로 이미지를 회전하고 가로 또는 세로로 뒤집습니다. 회전과 뒤집기 작업을 단일 요청으로 결합할 수 있습니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/rotate`

이미지 파일과 JSON `settings` 필드가 포함된 multipart form data를 허용합니다.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| angle | number | No | `0` | 회전 각도(도, 시계 방향). 임의의 숫자 값을 허용합니다. |
| horizontal | boolean | No | `false` | 이미지를 가로로 뒤집기(미러) |
| vertical | boolean | No | `false` | 이미지를 세로로 뒤집기 |

## Example Request {#example-request}

시계 방향으로 90도 회전:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/rotate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"angle": 90}'
```

가로로 뒤집기:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/rotate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"horizontal": true}'
```

회전과 뒤집기를 함께:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/rotate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"angle": 45, "vertical": true}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2480000
}
```

## Notes {#notes}

- 회전이 먼저 적용된 다음 뒤집기 작업이 적용됩니다.
- 90도가 아닌 회전(예: 45도)은 회전된 이미지에 맞게 캔버스를 확장하며, 출력 형식에 따라 투명 또는 검정색으로 채웁니다.
- 일반적인 값: 90, 180, 270(4분의 1 회전).
- EXIF 방향은 처리 전에 자동으로 적용되므로 회전은 시각적 방향을 기준으로 합니다.
