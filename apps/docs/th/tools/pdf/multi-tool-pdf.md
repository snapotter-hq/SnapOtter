---
description: "จัดเรียง หมุน ลบ และดึงหน้าจาก PDF อื่นในตัวแก้ไขเดียวหรือผ่าน API"
i18n_source_hash: 4eca29216d15
i18n_provenance: machine
i18n_output_hash: 521df823a350
i18n_hash_version: 2
---

# PDF Multi-Tool {#multi-tool-pdf}

ประกอบ PDF จากแผนหน้าเพจที่ชัดเจน: จัดเรียง ทำซ้ำ หมุน หรือลบหน้า และดึงหน้าจาก PDF เพิ่มเติม ทั้งหมดในคำขอเดียว

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/multi-tool-pdf`

ยอมรับข้อมูลฟอร์มแบบ multipart พร้อมไฟล์ PDF หนึ่งไฟล์ขึ้นไปและฟิลด์ JSON `settings`
รองรับเอกสารอินพุตสูงสุด 20 ฉบับและหน้าเอาต์พุต 1,200 หน้าต่อคำขอ

## Parameters {#parameters}

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| items | array | Yes | แผนหน้าเอาต์พุตตามลำดับเอาต์พุต แต่ละรายการคือ `{ "doc": <int>, "page": <int>, "rot": <90\|180\|270, optional> }` `doc` ใช้จัดลำดับไฟล์ที่อัปโหลดตามลำดับการอัปโหลด (เริ่มที่ 0); `page` คือหมายเลขหน้าที่เริ่มที่ 1 ในเอกสารนั้น |
| pageCounts | array | Yes | จำนวนหน้าจริงของแต่ละเอกสารที่อัปโหลด ตามลำดับเดียวกัน หน้าที่อยู่ในแผนเกินจำนวนหน้าของเอกสารจะถูกปฏิเสธด้วย 400 |

## Example Request {#example-request}

นำหน้า 3 และ 1 ของเอกสารแรก จากนั้นหน้า 1 และ 2 ของเอกสารที่สอง โดยหมุนหน้าเอาต์พุตแรก 90° ตามเข็มนาฬิกา:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/multi-tool-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F "file=@extra.pdf" \
  -F 'settings={"items":[{"doc":0,"page":3,"rot":90},{"doc":0,"page":1},{"doc":1,"page":1},{"doc":1,"page":2}],"pageCounts":[3,2]}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document_multi-tool.pdf",
  "originalSize": 2450000,
  "processedSize": 2450000
}
```

## Notes {#notes}

- หน้าเดียวกันสามารถปรากฏหลายครั้งใน `items` เพื่อทำซ้ำ
- หน้าที่ไม่อยู่ใน `items` จะถูกตัดออกจากเอาต์พุต
- `rot` บันทึกทิศทางการแสดงผลใหม่บนหน้าที่คัดลอก (รวมกับการหมุนที่มีอยู่); เนื้อหาหน้าไม่ถูกแก้ไข
- การหมุนใช้กับการคัดลอกเอาต์พุตแต่ละรายการ ดังนั้นสำเนาที่ทำซ้ำอาจมีการหมุนต่างกัน
- เอาต์พุตเป็นเอกสารใหม่แบบแบน ไม่เก็บบุ๊กมาร์กต้นทางและข้อมูลเมตาระดับเอกสาร
- การประมวลผลต้องใช้ไบนารี qpdf ซึ่งมาพร้อมในอิมเมจ Docker อย่างเป็นทางการ
