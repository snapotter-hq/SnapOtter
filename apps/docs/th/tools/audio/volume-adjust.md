---
description: "เพิ่มหรือลดระดับเสียงด้วยเกนคงที่เป็นเดซิเบล"
i18n_source_hash: b9bc1de2c9ef
i18n_provenance: human
i18n_output_hash: 17ef005cb8a2
---

# Volume Adjust {#volume-adjust}

เพิ่มหรือลดระดับเสียงของไฟล์เสียงโดยใช้เกนคงที่เป็นเดซิเบล

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/volume-adjust`

รับข้อมูล multipart form ที่มีไฟล์เสียงและฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| gainDb | number | No | `3` | การปรับระดับเสียงเป็นเดซิเบล (-30 ถึง 30) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/volume-adjust \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"gainDb": 6}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4500000
}
```

## Notes {#notes}

- ค่าบวกจะเพิ่มระดับเสียง ค่าลบจะลดระดับเสียง
- เกนบวกที่สูงอาจทำให้เกิดการตัดยอด (clipping) ใช้ normalize-audio สำหรับการปรับระดับความดังอย่างปลอดภัย
- โดยปกติผลลัพธ์จะคงคอนเทนเนอร์ของอินพุตไว้ อินพุต AAC จะถูกเขียนเป็น M4A และอินพุตที่ถอดรหัสได้เท่านั้นซึ่งไม่รองรับจะย้อนกลับไปเป็น MP3
