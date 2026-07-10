---
description: "Đóng dấu các hình ảnh chữ ký được tải lên lên một PDF bằng các vị trí trang được chuẩn hóa."
i18n_source_hash: c28f78c2e7fd
i18n_provenance: human
i18n_output_hash: 11eaf0d4b6aa
---

# Sign PDF {#sign-pdf}

Đóng dấu một hoặc nhiều hình ảnh chữ ký PNG được tải lên lên bất kỳ trang nào của một PDF. Tuyến này dùng một hợp đồng multipart tùy chỉnh vì nó cần PDF, một hoặc nhiều hình ảnh chữ ký, và tọa độ vị trí.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/sign-pdf`

Chấp nhận dữ liệu biểu mẫu multipart. PDF được gửi dưới dạng `file`; chữ ký được gửi dưới dạng `sig0`, `sig1`, và cứ thế; vị trí được gửi trong một trường JSON `placements`.

## Parameters {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| file | file | Có | - | Tệp PDF cần ký |
| sig0 | file | Có | - | Hình ảnh chữ ký đầu tiên. Các hình ảnh bổ sung dùng `sig1`, `sig2`, và cứ thế |
| placements | JSON string | Có | - | Mảng các đối tượng vị trí: `{ "sig": 0, "page": 0, "x": 0.2, "y": 0.7, "w": 0.25, "h": 0.08 }` |
| clientJobId | string | Không | - | UUID tùy chọn để theo dõi tiến độ qua SSE |
| fileId | string | Không | - | ID thư viện tệp tùy chọn để lưu kết quả đã ký thành một phiên bản mới |

## Placement Coordinates {#placement-coordinates}

| Trường | Kiểu | Mô tả |
|-------|------|-------------|
| sig | integer | Chỉ mục hình ảnh chữ ký. `0` ánh xạ tới `sig0` |
| page | integer | Chỉ mục trang PDF tính từ 0 |
| x | number | Vị trí trái theo tỷ lệ trang |
| y | number | Vị trí trên cùng theo tỷ lệ trang |
| w | number | Chiều rộng chữ ký theo tỷ lệ trang |
| h | number | Chiều cao chữ ký theo tỷ lệ trang |

Tọa độ dùng gốc trên-trái. Các giá trị có thể tràn nhẹ ra ngoài mép trang; trình kết xuất PDF cắt con dấu cuối cùng theo trang.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/sign-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@contract.pdf" \
  -F "sig0=@signature.png" \
  -F 'placements=[{"sig":0,"page":0,"x":0.64,"y":0.82,"w":0.22,"h":0.08}]'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/contract_signed.pdf",
  "previewUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/preview.png",
  "originalSize": 245000,
  "processedSize": 249000
}
```

Nếu yêu cầu không thể hoàn thành trong cửa sổ chờ đồng bộ, API trả về:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

Kết nối tới `/api/v1/jobs/<jobId>/progress` và tải xuống kết quả khi công việc hoàn thành.

## Notes {#notes}

- Định dạng đầu vào PDF được chấp nhận: `.pdf`.
- Hình ảnh chữ ký phải là các tệp hình ảnh hợp lệ, thường là PNG có độ trong suốt.
- Chấp nhận tối đa 100 hình ảnh chữ ký và 100 vị trí.
- `sign-pdf` là một tuyến tùy chỉnh và không dùng trường JSON `settings` công cụ tiêu chuẩn.
