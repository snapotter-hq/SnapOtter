---
description: "ดึงแทร็กคำบรรยายออกจากวิดีโอเป็นไฟล์ SRT, WebVTT หรือ ASS"
i18n_source_hash: 5af4dad67936
i18n_provenance: machine
i18n_output_hash: 35f6854c5799
i18n_hash_version: 2
---

# Extract Subtitles {#extract-subtitles}

ดึงแทร็กคำบรรยายที่ฝังอยู่ออกจากคอนเทนเนอร์วิดีโอและดาวน์โหลดเป็นไฟล์ SRT, WebVTT หรือ ASS

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/extract-subtitles`

รับข้อมูลแบบ multipart form พร้อมไฟล์วิดีโอและสตริง JSON `settings` ที่ไม่บังคับ

## Parameters {#parameters}

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `format` | string | `"srt"` | รูปแบบเอาต์พุต: `srt`, `vtt` (WebVTT) หรือ `ass` |

ระบบจะดึงแทร็กคำบรรยายแทร็กแรกที่พบในคอนเทนเนอร์วิดีโอ

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/extract-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"format":"vtt"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.vtt",
  "originalSize": 12500000,
  "processedSize": 4500
}
```

## Notes {#notes}

- วิดีโอต้องมีแทร็กคำบรรยายที่ฝังอยู่ หากไม่พบแทร็กคำบรรยาย คำขอจะคืนค่าข้อผิดพลาด 400
- หากวิดีโอมีแทร็กคำบรรยายหลายแทร็ก จะดึงแทร็กแรกออกมา
- แทร็กข้อความ (SubRip, ASS, mov_text, WebVTT) แปลงเป็นรูปแบบเอาต์พุตใดก็ได้จากทั้งสามรูปแบบ การแปลงแทร็ก ASS เป็น SRT หรือ WebVTT จะทำให้ตำแหน่งและเอฟเฟกต์หายไป
- แทร็กแบบภาพ (Blu-ray PGS, DVD VobSub) แปลงเป็นข้อความไม่ได้หากไม่มี OCR และจะคืนค่าข้อผิดพลาด 422
