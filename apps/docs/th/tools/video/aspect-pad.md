---
description: "เพิ่มแถบสีทึบเพื่อให้พอดีกับอัตราส่วนภาพเป้าหมาย"
i18n_source_hash: b8e17dffc341
i18n_provenance: human
i18n_output_hash: e7d22fd2f071
---

# Aspect Pad {#aspect-pad}

เพิ่มแถบสีทึบแบบเลตเตอร์บ็อกซ์หรือพิลลาร์บ็อกซ์เพื่อให้วิดีโอพอดีกับอัตราส่วนภาพเป้าหมายโดยไม่ต้องครอป

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/aspect-pad`

รับข้อมูลแบบ multipart form data พร้อมไฟล์วิดีโอและฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| target | string | No | `"9:16"` | อัตราส่วนภาพเป้าหมาย: `16:9`, `9:16`, `1:1`, `4:3`, `3:4` |
| color | string | No | `"#000000"` | สีฐานสิบหกสำหรับแถบเติมขอบ (เช่น `"#000000"` สำหรับสีดำ) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/aspect-pad \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"target": "1:1", "color": "#ffffff"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 13200000
}
```

## Notes {#notes}

- หากวิดีโอตรงกับอัตราส่วนภาพเป้าหมายอยู่แล้ว ไฟล์จะถูกคืนกลับมาโดยไม่เปลี่ยนแปลง
- ใช้ `9:16` สำหรับรูปแบบโซเชียลมีเดียแนวตั้ง (TikTok, Reels, Shorts)
- หากต้องการแถบเติมขอบแบบเบลอแทนสีทึบ ให้ใช้เครื่องมือ Blur Pad
