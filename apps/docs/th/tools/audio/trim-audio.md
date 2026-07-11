---
description: "ตัดช่วงหนึ่งออกจากไฟล์เสียงโดยระบุเวลาเริ่มต้นและสิ้นสุด"
i18n_source_hash: 8b80c5c8a711
i18n_provenance: human
i18n_output_hash: b4acbd9e8a69
---

# Trim Audio {#trim-audio}

ตัดช่วงหนึ่งออกจากไฟล์เสียงโดยระบุเวลาเริ่มต้นและสิ้นสุดเป็นวินาที

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/trim-audio`

รับข้อมูล multipart form ที่มีไฟล์เสียงและฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| startS | number | No | `0` | เวลาเริ่มต้นเป็นวินาที (ต่ำสุด 0) |
| endS | number | Yes | - | เวลาสิ้นสุดเป็นวินาที (ต้องอยู่หลังเวลาเริ่มต้น) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/trim-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"startS": 10, "endS": 45}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 1575000
}
```

## Notes {#notes}

- เวลาถูกระบุเป็นวินาทีและสามารถมีทศนิยมได้ (เช่น `10.5`)
- ค่า `endS` ต้องมากกว่า `startS`
- หาก `endS` เกินความยาวของเสียง ไฟล์จะถูกตัดถึงจุดสิ้นสุด
- โดยปกติผลลัพธ์จะคงคอนเทนเนอร์ของอินพุตไว้ อินพุต AAC จะถูกเขียนเป็น M4A และอินพุตที่ถอดรหัสได้เท่านั้นซึ่งไม่รองรับจะย้อนกลับไปเป็น MP3
