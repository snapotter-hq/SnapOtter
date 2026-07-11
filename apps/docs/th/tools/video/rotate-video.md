---
description: "หมุนหรือพลิกวิดีโอ"
i18n_source_hash: cf9620ca62c7
i18n_provenance: human
i18n_output_hash: be3d42db6f24
---

# Rotate Video {#rotate-video}

หมุนวิดีโอ 90, 180 หรือ 270 องศา หรือพลิกในแนวนอนหรือแนวตั้ง

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/rotate-video`

รับข้อมูลแบบ multipart form พร้อมไฟล์วิดีโอและฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| transform | string | Yes | - | การแปลงที่จะใช้: `cw90`, `ccw90`, `180`, `hflip`, `vflip` |

### Transform Values {#transform-values}

- **cw90** - หมุน 90 องศาตามเข็มนาฬิกา
- **ccw90** - หมุน 90 องศาทวนเข็มนาฬิกา
- **180** - หมุน 180 องศา
- **hflip** - พลิกแนวนอน (กระจก)
- **vflip** - พลิกแนวตั้ง

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/rotate-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"transform": "cw90"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12400000
}
```

## Notes {#notes}

- การหมุน 90 หรือ 270 องศาจะสลับความกว้างและความสูงของวิดีโอ
- การพลิก (hflip, vflip) ไม่เปลี่ยนขนาดของวิดีโอ
