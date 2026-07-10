---
description: "เบลอพื้นหลังในขณะที่ยังคงความคมชัดของวัตถุโดยใช้ AI"
i18n_source_hash: 9073f10e6e9d
i18n_provenance: human
i18n_output_hash: a751073fefd6
---

# Blur Background {#blur-background}

เบลอพื้นหลังของรูปภาพในขณะที่ยังคงความคมชัดของวัตถุ โมเดล AI จะแยกวัตถุออก, เบลอพื้นหลังเดิม และวางวัตถุที่คมชัดซ้อนทับด้านบน

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/blur-background`

รับข้อมูลแบบ multipart form data พร้อมไฟล์รูปภาพและฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| intensity | integer | No | `50` | ความเข้มของการเบลอ (1-100) |
| feather | integer | No | `0` | รัศมีการเบลอขอบ (0-20) |
| format | string | No | `"png"` | รูปแบบเอาต์พุต: `png` หรือ `webp` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/blur-background \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"intensity": 75, "feather": 3}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

ติดตามความคืบหน้าผ่าน SSE ที่ `GET /api/v1/jobs/{jobId}/progress` เมื่องานเสร็จสมบูรณ์ สตรีม SSE จะปล่อยเหตุการณ์ `completed` พร้อม URL สำหรับดาวน์โหลด

## Notes {#notes}

- นี่เป็นเครื่องมือที่ขับเคลื่อนด้วย AI ซึ่งส่งคืน `202 Accepted` และประมวลผลแบบอะซิงโครนัส เชื่อมต่อกับเอนด์พอยต์ SSE เพื่อรับการอัปเดตความคืบหน้าและผลลัพธ์สุดท้าย
- ต้องติดตั้งชุดฟีเจอร์ **background-removal** ส่งคืน `501` หากไม่มีชุดนี้
- ค่าความเข้มที่สูงขึ้นให้เอฟเฟกต์เบลอที่แรงขึ้น ค่าที่สูงกว่า 80 สร้างการแยกแบบโบเก้ที่ชัดเจน
- อินพุต HEIC, RAW, PSD และ SVG จะถูกถอดรหัสอัตโนมัติก่อนประมวลผล
