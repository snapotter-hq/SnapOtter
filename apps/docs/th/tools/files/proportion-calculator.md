---
description: "แก้บัญญัติไตรยางศ์ หา X จากค่าที่ทราบสามค่า"
i18n_source_hash: e0c21822bdae
i18n_provenance: machine
i18n_output_hash: 5537381bf6c5
i18n_hash_version: 2
---

# Proportion Calculator {#proportion-calculator}

แก้บัญญัติไตรยางศ์ (การคูณไขว้) พิมพ์ค่าสามค่า เลือกแบบตรงหรือแบบผกผัน แล้วรับค่าที่สี่ ค่าต่างๆ จะยังอยู่ในฟอร์มหลังแสดงคำตอบ คุณจึงเปลี่ยนตัวเลขหนึ่งตัวแล้วกด Enter เพื่อลองครั้งถัดไปได้

นี่คือตัวแก้สัดส่วนทางคณิตศาสตร์ ไม่ใช่เส้นตารางองค์ประกอบภาพตามกฎสามส่วน

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/proportion-calculator`

รับเนื้อหา JSON ไม่ใช่ multipart form data และตอบกลับด้วยตัวเลขแทนไฟล์ให้ดาวน์โหลด

## Parameters {#parameters}

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `a` | number | (จำเป็น) | ค่าที่ทราบค่าแรก |
| `b` | number | (จำเป็น) | ค่าที่คู่กับ `a` |
| `c` | number | (จำเป็น) | ค่าที่ทราบค่าที่สาม X คือค่าที่คู่กับค่านี้ |
| `mode` | string | `direct` | `direct` หรือ `inverse` |

| Mode | Reads as | Formula | Example |
|------|----------|---------|---------|
| `direct` | A ต่อ B เท่ากับ C ต่อ X | X = B × C ÷ A | แอปเปิล 3 ผลราคา 6 ดังนั้นแอปเปิล 10 ผลราคา 20 |
| `inverse` | A × B = C × X | X = A × B ÷ C | คนงาน 4 คนใช้เวลา 6 วัน ดังนั้นคนงาน 8 คนใช้เวลา 3 วัน |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/proportion-calculator \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"a": 3, "b": 6, "c": 10, "mode": "direct"}'
```

## Example Response {#example-response}

```json
{
  "mode": "direct",
  "x": 20
}
```

## Notes {#notes}

- คำตอบถูกปัดเศษที่ 15 หลักนัยสำคัญ ดังนั้น `0.1 × 3 ÷ 3` จึงได้ `0.1` ไม่ใช่ `0.10000000000000002`
- `a` เป็น `0` ไม่ได้ในสัดส่วนแบบตรง และ `c` เป็น `0` ไม่ได้ในสัดส่วนแบบผกผัน เพราะแต่ละตัวเป็นตัวหาร ทั้งสองกรณีจะตอบกลับ 400
- คำตอบที่อยู่นอกช่วงที่ double เก็บได้ (เกินประมาณ `1.8e308` หรือใกล้ศูนย์จนเก็บความแม่นยำไม่ได้) จะตอบกลับ 400
- ในเว็บแอปคุณพิมพ์ `1,5` หรือ `1.5` ได้ และใช้เลขอารบิก-อินดิกหรือเลขเทวนาครีได้เช่นกัน ไม่รองรับตัวคั่นหลักพัน
