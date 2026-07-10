---
description: "เพิ่มลายน้ำข้อความลงในทุกหน้าของ PDF"
i18n_source_hash: f1f7d8912fbd
i18n_provenance: human
i18n_output_hash: 5b507d9193ec
---

# Watermark PDF {#watermark-pdf}

ประทับลายน้ำข้อความลงบนทุกหน้าของ PDF โดยปรับตำแหน่ง ขนาด ความทึบ และการหมุนได้

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/watermark-pdf`

รับข้อมูลแบบ multipart form data พร้อมไฟล์ PDF และฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| text | string | Yes | - | ข้อความลายน้ำ (1-200 อักขระ) |
| position | string | No | `"c"` | ตำแหน่งบนหน้า: `tl`, `tc`, `tr`, `l`, `c`, `r`, `bl`, `bc`, `br` |
| fontSize | integer | No | `48` | ขนาดฟอนต์เป็นพอยต์ (6-72) |
| opacity | number | No | `0.3` | ความทึบของลายน้ำ (0.05-1) |
| rotation | number | No | `45` | มุมการหมุนเป็นองศา (-180 ถึง 180) |

### Position Values {#position-values}

- `tl` บนซ้าย, `tc` บนกลาง, `tr` บนขวา
- `l` กลางซ้าย, `c` กึ่งกลาง, `r` กลางขวา
- `bl` ล่างซ้าย, `bc` ล่างกลาง, `br` ล่างขวา

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/watermark-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"text": "CONFIDENTIAL", "position": "c", "opacity": 0.2, "rotation": 45}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2500000
}
```

## Notes {#notes}

- ลายน้ำจะถูกเรนเดอร์เป็นข้อความซ้อนทับบนแต่ละหน้า
- ข้อความลายน้ำ ตำแหน่ง และรูปแบบเดียวกันจะถูกใช้กับทุกหน้าอย่างสม่ำเสมอ
- ใช้ค่าความทึบต่ำ (0.1-0.3) สำหรับลายน้ำแบบจาง ๆ ที่ไม่บดบังเนื้อหา
