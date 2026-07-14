---
description: "แยกข้อความจาก PDF ที่สแกนในเครื่องด้วย Tesseract ในตัวหรือตัวเลือกรันไทม์ RapidOCR ที่มีความแม่นยำสูง"
i18n_output_hash: 9423995ad182
i18n_source_hash: a19ba25a1ca8
i18n_provenance: human
---

# PDF OCR {#pdf-ocr}

แยกข้อความจากเอกสาร PDF ที่สแกนทีละหน้าโดยไม่ต้องส่ง PDF ไปยังบริการภายนอก ระดับ `fast` ในตัวใช้ Tesseract ระดับ `balanced` และ `best` ที่เป็นอุปกรณ์เสริมใช้ RapidOCR กับรุ่น PP-OCR ONNX ที่ปักหมุดไว้


<!-- korean-ocr-contract:start -->
::: info ความเข้ากันได้ของ OCR ภาษาเกาหลี
OCR แบบเร็วรองรับ `auto`, `en`, `de`, `es`, `fr`, `zh` และ `ja` แต่ไม่รองรับภาษาเกาหลี (`ko`) ภาษาเกาหลีต้องใช้แพ็ก OCR แบบแม่นยำและ `balanced` หรือ `best` แพ็กทำงานบนคอนเทนเนอร์ Linux amd64 และ arm64 อย่างเป็นทางการ รวมถึงโฮสต์ NVIDIA ซึ่ง OCR ยังคงทำงานบน CPU ระบบที่ไม่รองรับจะส่งคืนข้อผิดพลาดความเข้ากันได้อย่างชัดเจนและไม่ย้อนกลับไปใช้ `fast` โดยเงียบ ๆ ภาษาเกาหลีร่วมกับ `fast` หรือนามแฝงเดิม `tesseract` จะถูกปฏิเสธก่อนเข้าคิวด้วย `FEATURE_INCOMPATIBLE` และ `fast-korean-unsupported`
:::
<!-- korean-ocr-contract:end -->
## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/ocr-pdf`

รับข้อมูลแบบ multipart form data พร้อมไฟล์ PDF และฟิลด์ JSON `settings` ที่ไม่บังคับ

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | ใช่ | - | ไฟล์ PDF (หลายส่วน) เข้ารหัสสูงสุด 512 MiB; ยังคงใช้ขีดจำกัดการอัปโหลดที่ต่ำกว่าของโอเปอเรเตอร์อยู่ |
| quality | string | เลขที่ | พลวัต | ระดับคุณภาพ OCR: `fast`, `balanced` หรือ `best` |
| language | string | No | `"auto"` | ภาษาของเอกสาร: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| pages | string | No | `"all"` | การเลือกหน้า เช่น `"all"`, `"1-3"`, `"1,3,5"` |
| enhance | boolean | เลขที่ | ขึ้นอยู่กับระดับ | ปรับปรุงความคมชัดในท้องถิ่นก่อนที่จะจดจำ ใช้งานได้อย่างรวดเร็วโดยตรง สมดุลและดีที่สุดจะคงตัวแปรไว้เฉพาะเมื่อการให้คะแนนที่ปรับเทียบแล้วช่วยปรับปรุงผลลัพธ์เท่านั้น ค่าเริ่มต้นเป็น `true` สำหรับ `best` และ `false` สำหรับ `fast`/`balanced` |
| engine | string | เลขที่ | - | นามแฝงความเข้ากันได้ที่เลิกใช้แล้ว ใช้ `quality` แทน `tesseract` แมปกับ `fast`; ค่า `paddleocr` ดั้งเดิมแมปกับ `balanced` แต่ไม่โหลด PaddlePaddle |

เมื่อไม่ระบุ `quality` และ `engine` SnapOtter จะเลือกระดับที่ดีที่สุดที่ใช้ได้ตามลำดับ `best`, `balanced`, `fast` สำหรับภาษาเกาหลีจะไม่เลือก `fast` แต่จะใช้ `best` แล้วจึง `balanced` หรือส่งคืนข้อผิดพลาดการติดตั้งหรือความเข้ากันได้ของรันไทม์แบบแม่นยำ

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/ocr-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@scanned.pdf" \
  -F 'settings={"quality": "best", "language": "en", "pages": "1-5", "enhance": true}'
```

## Example Response {#example-response}

คืนค่า `202 Accepted` ติดตามความคืบหน้าผ่าน SSE ที่ `/api/v1/jobs/{jobId}/progress`

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- รูปแบบอินพุตที่รองรับ: `.pdf`
- `fast` ถูกสร้างขึ้นและเพิ่มประมาณ 25 MiB ให้กับอิมเมจอย่างเป็นทางการ `balanced` และ `best` ต้องการแพ็กเสริม OCR ที่แม่นยำ (ดาวน์โหลดประมาณ 208-234 MiB และติดตั้ง 409-488 MiB ขึ้นอยู่กับเป้าหมาย)
- แพ็กที่แม่นยำรองรับ Linux amd64 และ arm64 และใช้ ONNX Runtime บน CPU รวมถึงบนโฮสต์ NVIDIA
- ระดับที่ร้องขออย่างชัดเจนจะไม่ถูกลดระดับอย่างเงียบ ๆ ถ้า `balanced` หรือ `best` ไม่พร้อมใช้งาน API จะส่งกลับ `501` ด้วย `FEATURE_NOT_INSTALLED` หรือ `FEATURE_INCOMPATIBLE`
- หน้า PDF จะถูกแรสเตอร์ที่ความละเอียดสูงก่อน OCR `best` ใช้งานโมเดล PP-OCRv6 สื่อกลางที่มีความแม่นยำสูงกว่า และให้คะแนนการวางแนวและตัวแปรการปรับปรุง ปรับปรุงการจดจำโดยแลกกับความเร็ว
- การตั้งค่าภาษา `auto` ช่วยให้สามารถจดจำชุดสคริปต์ที่รองรับได้ คำแนะนำที่ชัดเจนสามารถปรับปรุงผลลัพธ์สำหรับภาษาเอกสารที่รู้จักได้
- คุณสามารถเจาะจงหน้าเฉพาะได้โดยใช้ช่วง (`"1-3"`), รายการคั่นด้วยจุลภาค (`"1,3,5"`) หรือ `"all"` สำหรับทุกหน้า
- คำขอสามารถดำเนินการได้สูงสุด 50 หน้า ข้อมูลรอยขีดข่วนแบบแรสเตอร์ถูกจำกัดไว้ที่ 512 MiB และการตอบสนอง UTF-8 OCR รวมถูกจำกัดไว้ที่ 1,000,000 ไบต์ งานที่เกินขีดจำกัดล้มเหลวแทนที่จะส่งคืนข้อความบางส่วน
- สำหรับ PDF ที่มีข้อความที่เลือกได้อยู่แล้ว ให้พิจารณาใช้เครื่องมือ [PDF to Text](./pdf-to-text) ที่เร็วกว่าแทน
