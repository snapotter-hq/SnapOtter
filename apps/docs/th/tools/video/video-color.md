---
description: "ปรับความสว่าง คอนทราสต์ ความอิ่มตัวของสี และแกมมาของวิดีโอ"
i18n_source_hash: 40483b79d44b
i18n_provenance: human
i18n_output_hash: a91bf630c222
---

# Video Color {#video-color}

ปรับความสว่าง คอนทราสต์ ความอิ่มตัวของสี และการแก้ไขแกมมาบนวิดีโอ

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-color`

รับข้อมูลแบบ multipart form พร้อมไฟล์วิดีโอและฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| brightness | number | No | `0` | การปรับความสว่าง (-1 ถึง 1) |
| contrast | number | No | `1` | ตัวคูณคอนทราสต์ (0-4) |
| saturation | number | No | `1` | ตัวคูณความอิ่มตัวของสี (0-3) ตั้งเป็น 0 สำหรับภาพขาวดำ |
| gamma | number | No | `1` | การแก้ไขแกมมา (0.1-10) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-color \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"brightness": 0.1, "contrast": 1.2, "saturation": 1.5}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12300000
}
```

## Notes {#notes}

- ค่าทั้งหมดที่ค่าเริ่มต้น (brightness 0, contrast 1, saturation 1, gamma 1) จะไม่เกิดการเปลี่ยนแปลง
- การตั้งความอิ่มตัวของสีเป็น `0` จะแปลงวิดีโอเป็นภาพขาวดำ
- ค่าแกมมาต่ำกว่า 1 จะทำให้เงาสว่างขึ้น ในขณะที่ค่าสูงกว่า 1 จะทำให้เงามืดลง
