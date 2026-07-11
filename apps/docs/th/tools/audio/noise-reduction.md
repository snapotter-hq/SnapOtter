---
description: "ลดเสียงรบกวนพื้นหลังจากเสียงด้วยการกำจัดเสียงรบกวนแบบ FFT"
i18n_source_hash: 57cbdbd449aa
i18n_provenance: human
i18n_output_hash: c56d37107c94
---

# Noise Reduction {#noise-reduction}

ลดเสียงรบกวนพื้นหลังในไฟล์เสียงโดยใช้การกำจัดเสียงรบกวนแบบ FFT พร้อมความแรงที่เลือกได้

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/noise-reduction`

รับข้อมูลฟอร์มแบบ multipart พร้อมไฟล์เสียงและฟิลด์ JSON `settings`

## พารามิเตอร์ {#parameters}

| พารามิเตอร์ | ชนิด | จำเป็น | ค่าเริ่มต้น | คำอธิบาย |
|-----------|------|----------|---------|-------------|
| strength | string | ไม่ | `"medium"` | ความแรงในการกำจัดเสียงรบกวน: `light`, `medium`, `strong` |

## ตัวอย่างคำขอ {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/noise-reduction \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"strength": "strong"}'
```

## ตัวอย่างการตอบกลับ {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4500000
}
```

## หมายเหตุ {#notes}

- `light` รักษารายละเอียดไว้มากกว่าแต่ลดเสียงรบกวนได้น้อยกว่า `strong` ลดเสียงรบกวนได้มากกว่าแต่อาจทำให้เกิดสิ่งแปลกปลอมเล็กน้อย
- ให้ผลลัพธ์ที่ดีที่สุดกับการบันทึกที่มีเสียงรบกวนพื้นหลังคงที่ (เสียงพัดลมฮัม เครื่องปรับอากาศ เสียงซ่า)
- เอาต์พุตมักคงคอนเทนเนอร์อินพุตไว้ อินพุต AAC จะเขียนเป็น M4A และอินพุตแบบถอดรหัสอย่างเดียวที่ไม่รองรับจะถอยกลับเป็น MP3
