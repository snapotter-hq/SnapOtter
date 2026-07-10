---
description: "ตัดช่วงเงียบออกจากไฟล์เสียง"
i18n_source_hash: a7624fc99b50
i18n_provenance: human
i18n_output_hash: 15cd1b3fe547
---

# Silence Removal {#silence-removal}

ตรวจจับและลบช่วงที่เงียบออกจากไฟล์เสียงโดยอิงตามเกณฑ์และระยะเวลาต่ำสุดที่กำหนดค่าได้

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/silence-removal`

รับข้อมูล multipart form ที่มีไฟล์เสียงและฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| thresholdDb | number | No | `-50` | เกณฑ์ความเงียบเป็น dB (-80 ถึง -20) เสียงที่ต่ำกว่าระดับนี้จะถือว่าเป็นความเงียบ |
| minSilenceS | number | No | `0.5` | ระยะเวลาความเงียบต่ำสุดเป็นวินาทีที่จะลบ (0.1 ถึง 5) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/silence-removal \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"thresholdDb": -45, "minSilenceS": 1}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 3200000
}
```

## Notes {#notes}

- เกณฑ์ที่สูงกว่า (ติดลบน้อยกว่า) จะรุนแรงกว่าและลบทั้งช่วงที่เบาและช่วงเงียบจริง
- เพิ่มค่า `minSilenceS` เพื่อตัดเฉพาะช่วงหยุดที่ยาวขึ้นในขณะที่ยังคงช่องว่างธรรมชาติสั้น ๆ ไว้
- มีประโยชน์สำหรับการทำความสะอาดการบันทึกพอดแคสต์ การบรรยาย และบันทึกเสียง
- โดยปกติผลลัพธ์จะคงคอนเทนเนอร์ของอินพุตไว้ อินพุต AAC จะถูกเขียนเป็น M4A และอินพุตที่ถอดรหัสได้เท่านั้นซึ่งไม่รองรับจะย้อนกลับไปเป็น MP3
