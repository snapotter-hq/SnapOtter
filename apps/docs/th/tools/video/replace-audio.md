---
description: "สลับแทร็กเสียงของวิดีโอด้วยไฟล์อื่น"
i18n_source_hash: fabc2a953103
i18n_provenance: human
i18n_output_hash: b4c67b682f10
---

# Replace Audio {#replace-audio}

สลับแทร็กเสียงของวิดีโอด้วยไฟล์เสียง อัปโหลดทั้งไฟล์วิดีโอและไฟล์เสียง

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/replace-audio`

รับข้อมูลแบบ multipart form พร้อมสองไฟล์พอดี: ไฟล์วิดีโอตามด้วยไฟล์เสียง

## Parameters {#parameters}

เครื่องมือนี้ไม่มีพารามิเตอร์การตั้งค่า อัปโหลดไฟล์วิดีโอและไฟล์เสียงเป็นสองส่วน `file`

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/replace-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F "file=@voiceover.mp3"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 13100000
}
```

## Notes {#notes}

- ต้องอัปโหลดสองไฟล์พอดี: ไฟล์แรกต้องเป็นวิดีโอ ไฟล์ที่สองต้องเป็นไฟล์เสียง
- หากไฟล์เสียงยาวกว่าวิดีโอ จะถูกตัดให้ตรงกับระยะเวลาของวิดีโอ หากสั้นกว่า วิดีโอส่วนที่เหลือจะเล่นแบบเงียบ
- สตรีมวิดีโอจะถูกคัดลอกโดยไม่เข้ารหัสใหม่ จึงไม่มีการสูญเสียคุณภาพวิดีโอ
