---
description: "สกัดข้อความจากรูปภาพด้วยการรู้จำอักขระด้วยแสง (OCR) ที่ขับเคลื่อนด้วย AI"
i18n_source_hash: 3d85d423b82c
i18n_provenance: human
i18n_output_hash: 202ed36c57a2
---

# OCR / Text Extraction {#ocr-text-extraction}

สกัดข้อความจากรูปภาพด้วยการรู้จำอักขระด้วยแสง (OCR) ที่ขับเคลื่อนด้วย AI รองรับหลายภาษาและหลายระดับคุณภาพ

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/ocr`

**Processing:** การตอบกลับ JSON แบบซิงโครนัส หากระบุ `clientJobId` ความคืบหน้าจะถูกรายงานผ่าน SSE ด้วย

**Model bundle:** `ocr` (5-6 GB)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | ไฟล์รูปภาพ (multipart) |
| quality | string | No | `"balanced"` | ระดับคุณภาพ: `fast` (Tesseract), `balanced` (PaddleOCR v5), `best` (PaddleOCR VL) |
| language | string | No | `"auto"` | คำใบ้ภาษา: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| enhance | boolean | No | `true` | ประมวลผลรูปภาพล่วงหน้าเพื่อความแม่นยำ OCR ที่ดีขึ้น |
| engine | string | No | - | เลิกใช้แล้ว ให้ใช้ `quality` แทน แมป `tesseract` เป็น `fast`, `paddleocr` เป็น `balanced` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/ocr \
  -F "file=@document.png" \
  -F 'settings={"quality":"best","language":"en","enhance":true}'
```

## Response (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "filename": "document.png",
  "text": "Extracted text content from the image...",
  "engine": "paddleocr-vl"
}
```

### Progress (SSE, optional) {#progress-sse-optional}

หากระบุฟิลด์ฟอร์ม `clientJobId` เหตุการณ์ความคืบหน้าจะถูกสตรีม:

```
event: progress
data: {"phase":"processing","stage":"Recognizing text...","percent":50}
```

## Notes {#notes}

- ต้องติดตั้ง model bundle `ocr` (5-6 GB)
- OCR คืนค่าข้อความที่สกัดได้โดยตรง แทนที่จะเป็น URL ดาวน์โหลดรูปภาพ
- ใช้ลำดับสำรอง (fallback chain): หากระดับคุณภาพที่สูงกว่าล่ม (เช่น PaddleOCR segfault) ระบบจะลองใหม่โดยอัตโนมัติด้วยระดับที่ต่ำกว่าถัดไป
- หากระดับหนึ่งคืนค่าข้อความว่างโดยไม่ล่ม ระบบก็จะย้อนกลับไปยังระดับถัดไปเช่นกัน
- ระดับคุณภาพแมปกับเอนจิน: `fast` = Tesseract, `balanced` = PaddleOCR v5, `best` = PaddleOCR VL
- รองรับรูปแบบอินพุต HEIC/HEIF, RAW, TGA, PSD, EXR และ HDR ผ่านการถอดรหัสอัตโนมัติ
