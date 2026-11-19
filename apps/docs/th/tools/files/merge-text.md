---
description: "รวมไฟล์ข้อความหรือ Markdown หลายไฟล์เป็นไฟล์เดียวตามลำดับที่คุณเลือก"
i18n_source_hash: 9b3ddd1eba68
i18n_provenance: machine
i18n_output_hash: 97d79e179a50
i18n_hash_version: 2
---

# รวมไฟล์ข้อความ {#merge-text}

รวมไฟล์ข้อความหรือ Markdown หลายไฟล์เป็นไฟล์เดียว ไฟล์จะถูกต่อกันตามลำดับการอัปโหลด หากลำดับสำคัญ ให้จัดลำดับใหม่ในรายการไฟล์ก่อนเรียกใช้

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/merge-text`

รับข้อมูลฟอร์มแบบ multipart ที่มีไฟล์ข้อความตั้งแต่สองไฟล์ขึ้นไป และสตริง JSON `settings` แบบไม่บังคับ

## Parameters {#parameters}

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `separator` | string | `"blank-line"` | สิ่งที่คั่นระหว่างไฟล์: `"blank-line"`, `"rule"` (บรรทัด `---`) หรือ `"filename-heading"` (ชื่อของแต่ละไฟล์เป็นหัวข้อ) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/merge-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@chapter-1.md" \
  -F "file=@chapter-2.md" \
  -F 'settings={"separator":"filename-heading"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.md",
  "originalSize": 8200,
  "processedSize": 8240
}
```

## Notes {#notes}

- รับไฟล์ `.txt`, `.md`, `.markdown`, `.csv` และ `.log` ได้ 2 ถึง 50 ไฟล์ต่อคำขอ
- ทุกไฟล์ต้องเป็นข้อความ UTF-8 ไฟล์ไบนารีหรือไฟล์ที่ไม่ใช่ UTF-8 จะถูกปฏิเสธ และชื่อไฟล์จะแสดงในข้อผิดพลาด
- เมื่ออินพุตทั้งหมดมีนามสกุลเดียวกัน เอาต์พุตจะคงนามสกุลนั้นไว้ (`merged.md`, `merged.log`) ส่วนอินพุตที่ปะปนกันจะได้ `merged.txt`
- เมื่อใช้ `filename-heading` เอาต์พุต Markdown จะใช้หัวข้อ `# name.md` ส่วนเอาต์พุตข้อความธรรมดาจะใช้บรรทัดเครื่องหมาย `==> name.txt <==`
- บรรทัดว่างท้ายไฟล์แต่ละไฟล์จะถูกตัดออก เพื่อให้ตัวคั่นอยู่ระหว่างเอกสารอย่างเรียบร้อย และจะตัด byte-order mark ที่อยู่ต้นไฟล์ทิ้ง
- ไฟล์ CSV จะถูกต่อกันเป็นข้อความธรรมดา ใช้ [Merge CSVs](./merge-csvs) เพื่อรวมตารางโดยมีแถวหัวเพียงแถวเดียว
- ยังไม่รองรับไฟล์อีเมล `.eml`
