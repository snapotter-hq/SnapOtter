---
description: "เติมแถบขอบด้วยสำเนาที่เบลอของวิดีโอ"
i18n_source_hash: 0c72aaefc6de
i18n_provenance: human
i18n_output_hash: 8d840178f18a
---

# Blur Pad {#blur-pad}

ปรับวิดีโอให้พอดีกับอัตราส่วนภาพเป้าหมายโดยเติมพื้นที่ขอบด้วยสำเนาของวิดีโอที่เบลอและปรับขนาด แทนที่จะเป็นแถบสีทึบ

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/blur-pad`

รับข้อมูลแบบ multipart form data พร้อมไฟล์วิดีโอและฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| target | string | No | `"16:9"` | อัตราส่วนภาพเป้าหมาย: `16:9`, `9:16`, `1:1`, `4:3`, `3:4` |
| blur | number | No | `20` | ค่าซิกมาของการเบลอแบบเกาส์เซียนสำหรับพื้นหลัง (2-50) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/blur-pad \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"target": "16:9", "blur": 30}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 14100000
}
```

## Notes {#notes}

- ค่าเบลอที่สูงขึ้นจะให้พื้นหลังที่นุ่มนวลและเป็นนามธรรมมากขึ้น ค่าที่ต่ำกว่าจะคงรายละเอียดให้มองเห็นได้มากขึ้น
- หากวิดีโอตรงกับอัตราส่วนภาพเป้าหมายอยู่แล้ว ไฟล์จะถูกคืนกลับมาโดยไม่เปลี่ยนแปลง
- หากต้องการแถบเติมขอบแบบสีทึบ ให้ใช้เครื่องมือ Aspect Pad แทน
