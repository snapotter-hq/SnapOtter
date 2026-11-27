---
description: "Cắt xén tất cả các trang của một PDF theo lề hoặc theo một vùng."
i18n_source_hash: 338ff7bb64e5
i18n_provenance: machine
i18n_output_hash: c94560c7e098
i18n_hash_version: 2
---

# Crop PDF {#crop-pdf}

Cắt xén tất cả các trang của một PDF bằng một lề chung cho mọi cạnh, một lề riêng cho từng cạnh, hoặc cắt xuống một vùng như nhãn vận chuyển được in ở một góc của tờ giấy.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/crop-pdf`

Chấp nhận dữ liệu biểu mẫu multipart với một tệp PDF và một trường JSON `settings`.

## Parameters {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| mode | string | Không | `uniform` | `uniform`, `sides` hoặc `region` |
| margin | number | Không | `20` | Chế độ `uniform`: lề cắt xén cho mọi cạnh tính bằng điểm (0-2000) |
| top, right, bottom, left | number | Không | `0` | Chế độ `sides`: lề cắt xén cho từng cạnh tính bằng điểm (0-2000) |
| x, y | number | Không | `0` | Chế độ `region`: độ lệch của vùng so với cạnh trái và cạnh trên của trang tính bằng điểm |
| width, height | number | Không | `288`, `432` | Chế độ `region`: kích thước của vùng tính bằng điểm (nhãn 4x6 in) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/crop-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"margin": 50}'
```

Chỉ giữ lại nhãn 4x6 in ở góc trên bên trái của mỗi trang:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/crop-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@label.pdf" \
  -F 'settings={"mode": "region", "x": 0, "y": 0, "width": 288, "height": 432}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2440000
}
```

## Notes {#notes}

- Tất cả giá trị tính bằng điểm PDF (1 điểm = 1/72 inch). Một trang US Letter có kích thước 612 x 792 điểm.
- Mỗi chế độ chỉ đọc các trường của riêng nó, nên một yêu cầu chỉ gửi `margin` vẫn hoạt động bình thường.
- Một vùng được đo từ góc trên bên trái của mỗi trang và phải nằm gọn trong mọi trang. Các lề phải chừa lại một phần của mỗi trang. Nếu không, yêu cầu sẽ thất bại với `400`.
- Trên một trang được đặt để hiển thị xoay, các vị trí và cạnh được tính theo trang như đang hiển thị, nên góc trên bên trái của một vùng là góc trên bên trái của trang đã xoay.
- Mọi chế độ đều đo từ media box đầy đủ, nên cắt xén một trang đã được cắt xén sẽ bắt đầu lại từ trang đầy đủ. Một lề đồng nhất `0` hiển thị toàn bộ media box.
