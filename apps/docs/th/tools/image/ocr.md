---
description: "แยกข้อความจากรูปภาพในเครื่องด้วย Tesseract ในตัวหรือรันไทม์ RapidOCR ที่มีความแม่นยำสูงซึ่งเป็นตัวเลือก"
i18n_output_hash: fbb4ee729eac
i18n_source_hash: 0d453b49db02
i18n_provenance: human
---

# OCR / Text Extraction {#ocr-text-extraction}

แยกข้อความจากรูปภาพโดยไม่ต้องส่งรูปภาพไปยังบริการภายนอก ระดับ `fast` ในตัวใช้ Tesseract ระดับ `balanced` และ `best` ที่เป็นอุปกรณ์เสริมใช้ RapidOCR กับรุ่น PP-OCR ONNX ที่ปักหมุดไว้


<!-- korean-ocr-contract:start -->
::: info ความเข้ากันได้ของ OCR ภาษาเกาหลี
OCR แบบเร็วรองรับ `auto`, `en`, `de`, `es`, `fr`, `zh` และ `ja` แต่ไม่รองรับภาษาเกาหลี (`ko`) ภาษาเกาหลีต้องใช้แพ็ก OCR แบบแม่นยำและ `balanced` หรือ `best` แพ็กทำงานบนคอนเทนเนอร์ Linux amd64 และ arm64 อย่างเป็นทางการ รวมถึงโฮสต์ NVIDIA ซึ่ง OCR ยังคงทำงานบน CPU ระบบที่ไม่รองรับจะส่งคืนข้อผิดพลาดความเข้ากันได้อย่างชัดเจนและไม่ย้อนกลับไปใช้ `fast` โดยเงียบ ๆ ภาษาเกาหลีร่วมกับ `fast` หรือนามแฝงเดิม `tesseract` จะถูกปฏิเสธก่อนเข้าคิวด้วย `FEATURE_INCOMPATIBLE` และ `fast-korean-unsupported`
:::
<!-- korean-ocr-contract:end -->
## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/ocr`

**การประมวลผล:** OCR ทำงานแบบอะซิงโครนัสเสมอ หลังจากตรวจสอบและเพิ่มงานลงในคิวแล้ว endpoint จะส่งคืน `202 Accepted` พร้อม `jobId` ทันที ติดตามสตรีมความคืบหน้า SSE ของงานไปจนถึงเหตุการณ์สุดท้าย `complete` หรือ `failed`; `result` ของเหตุการณ์ที่สำเร็จจะมีฟิลด์ OCR

**แพ็ก OCR ที่แม่นยำ:** รันไทม์เสริม `ocr` (ดาวน์โหลดประมาณ 208-234 MiB และติดตั้ง 409-488 MiB ขึ้นอยู่กับเป้าหมาย) `fast` ไม่จำเป็นต้องใช้ชุดนี้ โปรแกรมติดตั้งจะตรวจสอบขนาดที่แน่นอนซึ่งผูกไว้กับดัชนีที่ลงนาม

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | ใช่ | - | ไฟล์ภาพ (หลายส่วน) เข้ารหัสสูงสุด 512 MiB และถอดรหัส 40 ล้านพิกเซล ยังคงใช้ขีดจำกัดการอัปโหลดที่ต่ำกว่าของโอเปอเรเตอร์อยู่ |
| quality | string | เลขที่ | พลวัต | ระดับคุณภาพ: `fast` (Tesseract), `balanced` (RapidOCR พร้อมรุ่น PP-OCRv6 ขนาดเล็ก) หรือ `best` (รุ่น PP-OCRv6 ขนาดกลางที่มีความแม่นยำสูงกว่าพร้อมการให้คะแนนตัวแปรที่ปรับเทียบแล้ว) |
| language | string | No | `"auto"` | คำใบ้ภาษา: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| enhance | boolean | เลขที่ | ขึ้นอยู่กับระดับ | ปรับปรุงความคมชัดในท้องถิ่นก่อนที่จะจดจำ ใช้งานได้อย่างรวดเร็วโดยตรง สมดุลและดีที่สุดจะคงตัวแปรไว้เฉพาะเมื่อการให้คะแนนที่ปรับเทียบแล้วช่วยปรับปรุงผลลัพธ์เท่านั้น ค่าเริ่มต้นเป็น `true` สำหรับ `best` และ `false` สำหรับ `fast`/`balanced` |
| engine | string | เลขที่ | - | นามแฝงความเข้ากันได้ที่เลิกใช้แล้ว ใช้ `quality` แทน `tesseract` แมปกับ `fast`; ค่า `paddleocr` ดั้งเดิมแมปกับ `balanced` แต่ไม่โหลด PaddlePaddle |

เมื่อไม่ระบุ `quality` และ `engine` SnapOtter จะเลือกระดับที่ดีที่สุดที่ใช้ได้ตามลำดับ `best`, `balanced`, `fast` สำหรับภาษาเกาหลีจะไม่เลือก `fast` แต่จะใช้ `best` แล้วจึง `balanced` หรือส่งคืนข้อผิดพลาดการติดตั้งหรือความเข้ากันได้ของรันไทม์แบบแม่นยำ

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/ocr \
  -F "file=@document.png" \
  -F 'settings={"quality":"best","language":"en","enhance":true}'
```

## การตอบกลับที่ยอมรับ (202) {#accepted-response-202}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### ความคืบหน้าและผลลัพธ์ (SSE) {#progress-sse-optional}

เชื่อมต่อกับ `GET /api/v1/jobs/{jobId}/progress` โดยใช้ `jobId` ที่การตอบกลับ `202` ส่งคืนมา (หรือ `clientJobId` ที่ระบุ) เปิดสตรีมไว้จนถึงเหตุการณ์สุดท้าย `complete` หรือ `failed` เฟรมสุดท้ายที่สำเร็จจะมีผลลัพธ์ OCR ใน `result`:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "type": "single",
  "phase": "complete",
  "stage": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document_ocr.txt",
    "originalSize": 12345,
    "processedSize": 47,
    "text": "Extracted text content from the image...",
    "engine": "rapidocr-onnx",
    "requestedQuality": "best",
    "actualQuality": "best",
    "device": "cpu",
    "provider": "CPUExecutionProvider",
    "degraded": false,
    "warnings": [],
    "runtimeVersion": "2.1.0",
    "modelVersion": "PP-OCRv6-best-v1-medium"
  }
}
```

ความล้มเหลวในการประมวลผลจะอยู่ในฟิลด์ `error` ของเหตุการณ์สุดท้าย `failed` และจะไม่ส่งคืนเป็น HTTP `422` หลังจากเพิ่มงานลงในคิวแล้ว

## Notes {#notes}

- `fast` พร้อมใช้งานเสมอในอิมเมจ SnapOtter ที่รองรับ `balanced` และ `best` ต้องใช้ชุดเสริม OCR ที่แม่นยำ
- บิวท์อิน Tesseract เพิ่มประมาณ 25 MiB สู่ภาพอย่างเป็นทางการ แพ็คที่ถูกต้องจะถูกเก็บไว้ใน `/data/ai`, ไม่อบเข้าไปในภาพ
- มีการเผยแพร่บรรจุภัณฑ์ที่ถูกต้องสำหรับคอนเทนเนอร์ Linux amd64 และ arm64 อย่างเป็นทางการ โดยเจตนาใช้ผู้ให้บริการ CPU ของ ONNX Runtime รวมถึงบนโฮสต์ NVIDIA ดังนั้นจึงไม่ได้ขึ้นอยู่กับไลบรารี CUDA หรือความเข้ากันได้ของ GPU ต้นทางและการติดตั้ง bare-metal ที่สร้างไว้ล่วงหน้าจะใช้ Fast OCR เว้นแต่จะมีรันไทม์ที่เข้ากันได้ของตัวเอง
- `result` สุดท้ายที่สำเร็จมีทั้งข้อความที่สกัดใน `text` และอาร์ติแฟกต์ `.txt` ที่ดาวน์โหลดได้ใน `downloadUrl`
- SnapOtter ให้เกียรติระดับที่ร้องขออย่างชัดเจน ถ้า `balanced` หรือ `best` ไม่พร้อมใช้งาน API จะส่งกลับ `501` ด้วย `FEATURE_NOT_INSTALLED` หรือ `FEATURE_INCOMPATIBLE` มันไม่เคยดาวน์เกรดคำขอไปยังระดับอื่นโดยไม่มีการแจ้ง
- ผลลัพธ์ที่ว่างเปล่าที่สำเร็จยังคงเป็นผลลัพธ์ที่ว่างเปล่า ความล้มเหลวรันไทม์ส่งคืนข้อผิดพลาดแทนที่จะลองอีกครั้งด้วยกลไกคุณภาพต่ำกว่า
- `result` สุดท้ายที่สำเร็จจะรายงานทั้ง `requestedQuality` และ `actualQuality` รวมถึงกลไก อุปกรณ์ ผู้ให้บริการ รันไทม์และเวอร์ชันของรุ่น และคำเตือนใดๆ
- รองรับรูปแบบอินพุต HEIC/HEIF, RAW, TGA, PSD, EXR และ HDR ผ่านการถอดรหัสอัตโนมัติ
- อินพุตที่เข้ารหัสขนาดใหญ่ส่งคืน `413` รูปภาพที่มีขนาดมากกว่า 40 เมกะพิกเซลและการตอบสนองของ OCR ที่เกินขีดจำกัดเอาต์พุตที่มีขอบเขตจะถูกปฏิเสธแทนที่จะถูกประมวลผลบางส่วน
