---
description: "แบ่งภาพหนึ่งภาพออกเป็นไทล์แบบตารางตามจำนวนแถวและคอลัมน์ หรือตามขนาดพิกเซล คืนค่าเป็นไฟล์ ZIP"
i18n_source_hash: 57a2e11e7cce
i18n_provenance: human
i18n_output_hash: 1e134c68d446
---

# Image Splitting {#image-splitting}

แบ่งภาพเดียวออกเป็นไทล์แบบตารางตามจำนวนคอลัมน์/แถว หรือตามขนาดพิกเซลที่กำหนด คืนค่าเป็นไฟล์ ZIP ที่มีไทล์ทั้งหมด

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/split`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| columns | integer | No | 3 | จำนวนคอลัมน์ที่จะแบ่ง (1 ถึง 100) |
| rows | integer | No | 3 | จำนวนแถวที่จะแบ่ง (1 ถึง 100) |
| tileWidth | integer | No | - | ความกว้างไทล์เป็นพิกเซล (ต่ำสุด 10) จะแทนที่ `columns` เมื่อกำหนดทั้ง `tileWidth` และ `tileHeight` |
| tileHeight | integer | No | - | ความสูงไทล์เป็นพิกเซล (ต่ำสุด 10) จะแทนที่ `rows` เมื่อกำหนดทั้ง `tileWidth` และ `tileHeight` |
| outputFormat | string | No | `"original"` | รูปแบบผลลัพธ์สำหรับไทล์: `original`, `png`, `jpg`, `webp`, `avif`, `jxl` |
| quality | number | No | 90 | คุณภาพผลลัพธ์สำหรับรูปแบบแบบสูญเสียข้อมูล (1 ถึง 100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/split \
  -F "file=@large-image.png" \
  -F 'settings={"columns":3,"rows":3,"outputFormat":"png"}' \
  --output split-tiles.zip
```

## Example Response {#example-response}

การตอบกลับจะสตรีมออกมาโดยตรงเป็นไฟล์ ZIP พร้อม `Content-Type: application/zip` ชื่อไฟล์เป็นไปตามรูปแบบ `split-<jobId>.zip`

แต่ละไทล์ภายใน ZIP ตั้งชื่อเป็น `<originalBaseName>_r<row>_c<col>.<ext>` (เช่น `photo_r1_c1.png`, `photo_r2_c3.webp`)

## Notes {#notes}

- รับไฟล์ภาพเพียงไฟล์เดียว
- รองรับรูปแบบไฟล์นำเข้า HEIC, RAW, PSD และ SVG (ถอดรหัสอัตโนมัติ)
- เมื่อกำหนดทั้ง `tileWidth` และ `tileHeight` ค่าเหล่านี้จะมีความสำคัญเหนือกว่า `columns`/`rows` ขนาดตารางจะคำนวณเป็น `ceil(imageWidth / tileWidth)` และ `ceil(imageHeight / tileHeight)`
- ไทล์ขอบ (คอลัมน์ขวาสุด แถวล่างสุด) อาจมีขนาดเล็กกว่าขนาดไทล์ที่ระบุ หากขนาดภาพหารไม่ลงตัว
- ขนาดตารางสูงสุดถูกจำกัดไว้ที่ 100x100 (10,000 ไทล์)
- การตอบกลับจะสตรีม ZIP ออกมาโดยตรง จึงไม่มี body การตอบกลับแบบ JSON ใช้ `--output` กับ curl เพื่อบันทึกไฟล์
