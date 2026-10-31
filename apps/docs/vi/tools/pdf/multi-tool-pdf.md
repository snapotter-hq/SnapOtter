---
description: "Sắp xếp lại, xoay, xóa và kéo các trang từ PDF khác trong một trình chỉnh sửa hoặc qua API."
i18n_source_hash: 4eca29216d15
i18n_provenance: machine
i18n_output_hash: 06cea6889174
i18n_hash_version: 2
---

# PDF Multi-Tool {#multi-tool-pdf}

Tạo một PDF từ kế hoạch trang rõ ràng: sắp xếp lại, nhân bản, xoay hoặc xóa các trang và kéo các trang từ PDF bổ sung, tất cả trong một yêu cầu.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/multi-tool-pdf`

Chấp nhận dữ liệu biểu mẫu multipart với một hoặc nhiều tệp PDF và trường JSON `settings`.
Hỗ trợ tối đa 20 tài liệu đầu vào và 1.200 trang đầu ra mỗi yêu cầu.

## Parameters {#parameters}

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| items | array | Yes | Kế hoạch trang đầu ra, theo thứ tự đầu ra. Mỗi mục là `{ "doc": <int>, "page": <int>, "rot": <90\|180\|270, optional> }`. `doc` đánh chỉ mục các tệp đã tải lên theo thứ tự tải lên (bắt đầu từ 0); `page` là số trang bắt đầu từ 1 trong tài liệu đó. |
| pageCounts | array | Yes | Số trang thực tế của từng tài liệu đã tải lên, theo cùng thứ tự. Một trang trong kế hoạch vượt quá số trang của tài liệu đó sẽ bị từ chối với mã 400. |

## Example Request {#example-request}

Lấy trang 3 và 1 của tài liệu đầu tiên, sau đó trang 1 và 2 của tài liệu thứ hai, xoay trang đầu ra đầu tiên 90° theo chiều kim đồng hồ:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/multi-tool-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F "file=@extra.pdf" \
  -F 'settings={"items":[{"doc":0,"page":3,"rot":90},{"doc":0,"page":1},{"doc":1,"page":1},{"doc":1,"page":2}],"pageCounts":[3,2]}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document_multi-tool.pdf",
  "originalSize": 2450000,
  "processedSize": 2450000
}
```

## Notes {#notes}

- Cùng một trang có thể xuất hiện nhiều lần trong `items` để nhân bản.
- Các trang không có trong `items` bị bỏ khỏi đầu ra.
- `rot` ghi lại hướng hiển thị mới trên trang được sao chép (kết hợp với mọi vòng xoay hiện có); nội dung trang không bị thay đổi.
- Vòng xoay được áp dụng cho từng bản sao đầu ra, vì vậy các bản sao có thể có vòng xoay khác nhau.
- Đầu ra là một tài liệu mới, phẳng; dấu trang nguồn và siêu dữ liệu cấp tài liệu không được giữ lại.
- Quá trình xử lý cần tệp nhị phân qpdf, được đóng gói trong image Docker chính thức.
