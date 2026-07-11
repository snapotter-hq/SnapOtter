---
description: "เปลี่ยนภาพหน้าจอธรรมดาให้เป็นรูปภาพที่ดูดีด้วยพื้นหลังไล่ระดับสี, เฟรมอุปกรณ์, เงา และขนาดสำหรับโซเชียลมีเดีย"
i18n_source_hash: 8fd8a930a45e
i18n_provenance: human
i18n_output_hash: b3d777621d1c
---

# Beautify Screenshot {#beautify-screenshot}

เพิ่มพื้นหลังไล่ระดับสี, เฟรมอุปกรณ์, เงา, ลายน้ำ และขนาดสำหรับโซเชียลมีเดียให้กับภาพหน้าจอ เหมาะสำหรับสร้างรูปภาพที่ดูดีสำหรับการตลาดผลิตภัณฑ์, โซเชียลมีเดีย และเอกสารประกอบ

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/beautify`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| backgroundType | string | No | `"linear-gradient"` | ประเภทพื้นหลัง: `solid`, `linear-gradient`, `radial-gradient`, `image`, `transparent` |
| backgroundColor | string | No | `"#667eea"` | สีพื้นหลังทึบ (ใช้เมื่อ `backgroundType` เป็น `solid`) |
| gradientStops | array | No | `[{"color":"#667eea","position":0},{"color":"#764ba2","position":100}]` | จุดไล่ระดับสี (อย่างน้อย 2) แต่ละจุดมี `color` (hex) และ `position` (0-100) |
| gradientAngle | number | No | 135 | มุมไล่ระดับสีเป็นองศา (0 ถึง 360) |
| padding | number | No | 64 | ระยะขอบรอบรูปภาพเป็นพิกเซล (0 ถึง 256) |
| borderRadius | number | No | 12 | รัศมีมุมบนภาพหน้าจอ (0 ถึง 64) |
| shadowPreset | string | No | `"subtle"` | พรีเซ็ตเงา: `none`, `subtle`, `medium`, `dramatic`, `custom` |
| shadowBlur | number | No | 20 | รัศมีการเบลอเงาแบบกำหนดเอง (0 ถึง 100, ใช้เมื่อ `shadowPreset` เป็น `custom`) |
| shadowOffsetX | number | No | 0 | ระยะเลื่อนแนวนอนของเงาแบบกำหนดเอง (-50 ถึง 50) |
| shadowOffsetY | number | No | 10 | ระยะเลื่อนแนวตั้งของเงาแบบกำหนดเอง (-50 ถึง 50) |
| shadowColor | string | No | `"#000000"` | สีเงาแบบกำหนดเองเป็น hex |
| shadowOpacity | number | No | 30 | ความทึบของเงาแบบกำหนดเอง (0 ถึง 100) |
| frame | string | No | `"none"` | เฟรมอุปกรณ์หรือหน้าต่าง: `none`, `macos-light`, `macos-dark`, `windows-light`, `windows-dark`, `browser-light`, `browser-dark`, `iphone`, `iphone-dark`, `macbook`, `macbook-dark`, `ipad`, `ipad-dark` |
| frameTitle | string | No | - | ข้อความชื่อที่แสดงในแถบชื่อของเฟรมหน้าต่าง |
| socialPreset | string | No | `"none"` | ปรับขนาดตามมิติของโซเชียลมีเดีย: `none`, `twitter`, `linkedin`, `instagram-square`, `instagram-story`, `facebook`, `producthunt` |
| watermarkText | string | No | - | ข้อความลายน้ำซ้อนทับที่เป็นทางเลือก |
| watermarkPosition | string | No | `"bottom-right"` | ตำแหน่งลายน้ำ: `top-left`, `top-right`, `bottom-left`, `bottom-right`, `center` |
| watermarkOpacity | number | No | 50 | ความทึบของลายน้ำ (0 ถึง 100) |
| outputFormat | string | No | `"png"` | รูปแบบเอาต์พุต: `png`, `jpeg`, `webp` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/beautify \
  -F "file=@screenshot.png" \
  -F 'settings={"backgroundType":"linear-gradient","gradientStops":[{"color":"#667eea","position":0},{"color":"#764ba2","position":100}],"gradientAngle":135,"padding":64,"borderRadius":12,"shadowPreset":"medium","frame":"macos-dark","socialPreset":"twitter"}'
```

### With Background Image {#with-background-image}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/beautify \
  -F "file=@screenshot.png" \
  -F "backgroundImage=@bg-texture.jpg" \
  -F 'settings={"backgroundType":"image","padding":80,"borderRadius":16,"shadowPreset":"dramatic"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/screenshot.png",
  "originalSize": 234567,
  "processedSize": 567890
}
```

## Notes {#notes}

- รับฟิลด์ไฟล์สองฟิลด์: `file` (จำเป็น, ภาพหน้าจอหลัก) และ `backgroundImage` (ทางเลือก, ใช้เมื่อ `backgroundType` เป็น `image`)
- รองรับรูปแบบอินพุต HEIC, RAW, PSD และ SVG (ถอดรหัสอัตโนมัติ)
- พรีเซ็ตเงาแมปกับค่าเฉพาะดังนี้:
  - `subtle`: เบลอ 20, offsetY 4, ความทึบ 20%
  - `medium`: เบลอ 40, offsetY 10, ความทึบ 35%
  - `dramatic`: เบลอ 80, offsetY 20, ความทึบ 50%
- พรีเซ็ตโซเชียลมีเดียปรับขนาดเอาต์พุตสุดท้ายให้พอดีกับมิติเป้าหมายโดยใช้โหมด `contain`:
  - `twitter`: 1600x900
  - `linkedin`: 1200x627
  - `instagram-square`: 1080x1080
  - `instagram-story`: 1080x1920
  - `facebook`: 1200x630
  - `producthunt`: 1270x760
- เฟรมอุปกรณ์ (`iphone`, `macbook`, `ipad`) ใช้ขอบฮาร์ดแวร์รอบรูปภาพและข้ามการตั้งค่า `borderRadius`
- เมื่อจำเป็นต้องมีความโปร่งใส (เงา, รัศมีมุม, เฟรมอุปกรณ์ หรือพื้นหลังโปร่งใส) เอาต์พุตจะถูกบังคับเป็น PNG แม้ว่าจะเลือก `jpeg` ไว้ก็ตาม
- พื้นหลังแบบรูปภาพไม่รองรับในโหมดไปป์ไลน์/แบตช์
