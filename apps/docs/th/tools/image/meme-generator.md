---
description: "สร้างมีมด้วยเทมเพลตหรือรูปภาพที่กำหนดเอง กล่องข้อความที่จัดสไตล์แล้ว และตัวเลือกฟอนต์"
i18n_source_hash: 0a4970112ca6
i18n_provenance: human
i18n_output_hash: f4592deb7215
---

# Meme Generator {#meme-generator}

สร้างมีมโดยใช้เทมเพลตในตัวหรือรูปภาพที่กำหนดเอง เพิ่มข้อความด้วยสไตล์มีมแบบคลาสสิก (ข้อความตัวหนา มีเส้นขอบ) เลย์เอาต์สำเร็จรูปหลายแบบ และตัวเลือกฟอนต์

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/meme-generator`

รับได้ทั้งสองแบบ:
- **Multipart form data** พร้อมไฟล์รูปภาพและฟิลด์ JSON `settings` (โหมดรูปภาพที่กำหนดเอง)
- **JSON body** พร้อม `templateId` (โหมดเทมเพลต ไม่จำเป็นต้องอัปโหลดไฟล์)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| templateId | string | No | - | ID เทมเพลตมีมในตัว ถ้าระบุไว้ ไม่จำเป็นต้องอัปโหลดรูปภาพ |
| textLayout | string | No | `"top-bottom"` | เลย์เอาต์กล่องข้อความ: `top-bottom`, `top-only`, `bottom-only`, `center`, `side-by-side` |
| textBoxes | array | No | `[]` | อาร์เรย์ของออบเจกต์กล่องข้อความที่มีฟิลด์ `id` และ `text` |
| fontFamily | string | No | `"anton"` | ฟอนต์: `anton`, `arial-black`, `comic-sans`, `montserrat`, `bebas-neue`, `permanent-marker`, `roboto` |
| fontSize | number | No | auto | ขนาดฟอนต์เป็นพิกเซล (8 ถึง 200) คำนวณอัตโนมัติหากไม่ระบุ |
| textColor | string | No | `"#ffffff"` | สีเติมข้อความ |
| strokeColor | string | No | `"#000000"` | สีเส้นขอบ/เส้นรอบข้อความ |
| textAlign | string | No | `"center"` | การจัดแนวข้อความ: `left`, `center`, `right` |
| allCaps | boolean | No | `true` | แปลงข้อความเป็นตัวพิมพ์ใหญ่ |

### Text Boxes {#text-boxes}

แต่ละรายการในอาร์เรย์ `textBoxes` ควรมี:

| Field | Type | Description |
|-------|------|-------------|
| id | string | ตัวระบุกล่องที่ตรงกับเลย์เอาต์ (เช่น `"top"`, `"bottom"`, `"left"`, `"right"`, `"center"`) |
| text | string | ข้อความมีมที่จะแสดง |

### Text Layout Box IDs {#text-layout-box-ids}

| Layout | Available Box IDs |
|--------|-------------------|
| `top-bottom` | `top`, `bottom` |
| `top-only` | `top` |
| `bottom-only` | `bottom` |
| `center` | `center` |
| `side-by-side` | `left`, `right` |

## Example Request {#example-request}

รูปภาพที่กำหนดเองพร้อมข้อความด้านบนและด้านล่าง:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/meme-generator \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"textLayout": "top-bottom", "textBoxes": [{"id": "top", "text": "When the code works"}, {"id": "bottom", "text": "On the first try"}], "fontFamily": "anton", "allCaps": true}'
```

ใช้เทมเพลตในตัว (JSON body ไม่ต้องอัปโหลดไฟล์):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/meme-generator \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"templateId": "drake", "textBoxes": [{"id": "top", "text": "Manual testing"}, {"id": "bottom", "text": "Automated tests"}]}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/meme-drake.png",
  "originalSize": 450000,
  "processedSize": 520000
}
```

## Notes {#notes}

- ต้องระบุ `templateId` หรือไฟล์รูปภาพที่อัปโหลดอย่างใดอย่างหนึ่ง หากระบุทั้งสอง จะใช้เทมเพลต
- เทมเพลตกำหนดตำแหน่งกล่องข้อความของตัวเอง พารามิเตอร์ `textLayout` จะถูกละเว้นเมื่อใช้เทมเพลต
- ข้อความถูกเรนเดอร์เป็น SVG พร้อมเส้นขอบเพื่อให้ได้ลุคมีมแบบคลาสสิก
- ขนาดฟอนต์จะถูกคำนวณอัตโนมัติให้พอดีกับกล่องข้อความหากไม่ได้ตั้งค่าไว้อย่างชัดเจน
- กล่องข้อความที่ว่างเปล่าจะถูกข้าม (ไม่มีการเรนเดอร์หากทุกกล่องว่างเปล่า)
- ชื่อไฟล์เอาต์พุตจะรวม ID เทมเพลตเมื่อใช้เทมเพลต (เช่น `meme-drake.png`)
- อินพุต HEIC, RAW, PSD และ SVG จะถูกถอดรหัสโดยอัตโนมัติก่อนการประมวลผล
