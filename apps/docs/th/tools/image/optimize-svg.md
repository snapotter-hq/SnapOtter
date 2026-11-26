---
description: "ย่อไฟล์ SVG ด้วย svgo และเก็บผลลัพธ์เป็น SVG แบบเวกเตอร์ พร้อมตัวเลือกความแม่นยำ หลายรอบ เมทาดาทา และการจัดรูปแบบ"
i18n_source_hash: c2601cc2cdd8
i18n_provenance: machine
i18n_output_hash: 300977b8602e
i18n_hash_version: 2
---

# เพิ่มประสิทธิภาพ SVG {#optimize-svg}

ลดขนาดไฟล์ SVG ด้วยการลบเศษข้อมูลจากโปรแกรมแก้ไข แอตทริบิวต์ที่ซ้ำซ้อน และทศนิยมที่เกินจำเป็น แล้วดาวน์โหลดผลลัพธ์เป็น SVG ต่างจาก “เพิ่มประสิทธิภาพสำหรับเว็บ” ตรงที่ผลลัพธ์จะไม่ถูกแปลงเป็นแรสเตอร์

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/optimize-svg`

รับข้อมูลฟอร์มแบบ multipart ที่มีไฟล์ `.svg` หรือ `.svgz` และฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| precision | number | No | `3` | จำนวนตำแหน่งทศนิยมที่เก็บไว้ในข้อมูลพาธและตัวเลข (0 ถึง 8) ค่าที่ต่ำลงทำให้ไฟล์เล็กลงและเส้นโค้งหยาบขึ้นเล็กน้อย |
| multipass | boolean | No | `true` | รันตัวเพิ่มประสิทธิภาพซ้ำจนกว่าผลลัพธ์จะไม่เล็กลงอีก |
| removeMetadata | boolean | No | `true` | ลบคอมเมนต์ `<metadata>` `<desc>` และข้อมูลเฉพาะของโปรแกรมแก้ไข ปิดเพื่อเก็บไว้ |
| pretty | boolean | No | `false` | เยื้องผลลัพธ์เพื่อให้อ่านง่าย แทนที่จะย่อให้เหลือไม่กี่บรรทัด |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/optimize-svg \
  -F "file=@logo.svg" \
  -F 'settings={"precision":3,"multipass":true,"removeMetadata":true,"pretty":false}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/logo.svg",
  "originalSize": 48213,
  "processedSize": 17904
}
```

## Notes {#notes}

- อินพุตต้องเป็นไฟล์ SVG หรือ SVGZ ภาพแรสเตอร์จะถูกปฏิเสธด้วย `400` และรหัส `IMAGE_UNDECODABLE`
- อินพุต `.svgz` จะถูกแตกไฟล์ก่อน และผลลัพธ์จะเป็น `.svg` ธรรมดาเสมอ
- SVG จำกัดที่ 2 MB หลังแตกไฟล์ ไฟล์ที่ใหญ่กว่านั้นจะถูกปฏิเสธด้วย `400` และรหัส `SVG_TOO_LARGE`
- `viewBox` และ `<title>` จะถูกเก็บไว้เสมอ กราฟิกจึงยังปรับขนาดได้และคงชื่อที่เข้าถึงได้
- ทั้งอินพุตและผลลัพธ์ผ่านตัวทำความสะอาด SVG ซึ่งลบสคริปต์และเนื้อหาที่ทำงานได้อื่น ๆ
- การลด `precision` ช่วยประหยัดขนาดได้มากที่สุดสำหรับงานที่มีพาธจำนวนมาก ตรวจผลลัพธ์ด้วยตาที่ค่า 0 ถึง 2
