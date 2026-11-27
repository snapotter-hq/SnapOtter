---
description: "Giải quy tắc tam suất, tìm X từ ba giá trị đã biết."
i18n_source_hash: e0c21822bdae
i18n_provenance: machine
i18n_output_hash: 4e34f0eab308
i18n_hash_version: 2
---

# Proportion Calculator {#proportion-calculator}

Giải quy tắc tam suất (nhân chéo). Nhập ba giá trị, chọn thuận hoặc nghịch, rồi nhận giá trị thứ tư. Các giá trị vẫn nằm trong biểu mẫu sau mỗi lần có đáp án, nên bạn có thể đổi một con số và nhấn Enter để thử lần tiếp theo.

Đây là công cụ giải tỉ lệ trong toán học, không phải lưới bố cục ảnh theo quy tắc một phần ba.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/proportion-calculator`

Nhận nội dung JSON, không phải multipart form data, và trả về một con số thay vì một tệp để tải xuống.

## Parameters {#parameters}

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `a` | number | (bắt buộc) | Giá trị đã biết thứ nhất. |
| `b` | number | (bắt buộc) | Giá trị đi cùng với `a`. |
| `c` | number | (bắt buộc) | Giá trị đã biết thứ ba. X là giá trị đi cùng với nó. |
| `mode` | string | `direct` | `direct` hoặc `inverse`. |

| Mode | Reads as | Formula | Example |
|------|----------|---------|---------|
| `direct` | A so với B như C so với X | X = B × C ÷ A | 3 quả táo giá 6, vậy 10 quả táo giá 20 |
| `inverse` | A × B = C × X | X = A × B ÷ C | 4 công nhân mất 6 ngày, vậy 8 công nhân mất 3 ngày |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/proportion-calculator \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"a": 3, "b": 6, "c": 10, "mode": "direct"}'
```

## Example Response {#example-response}

```json
{
  "mode": "direct",
  "x": 20
}
```

## Notes {#notes}

- Đáp án được làm tròn đến 15 chữ số có nghĩa, nên `0.1 × 3 ÷ 3` trả về `0.1` thay vì `0.10000000000000002`.
- `a` không thể là `0` trong tỉ lệ thuận và `c` không thể là `0` trong tỉ lệ nghịch, vì mỗi giá trị đó là số chia. Cả hai trường hợp đều trả về 400.
- Đáp án nằm ngoài khoảng mà một số double có thể chứa (trên khoảng `1.8e308`, hoặc quá gần 0 nên không giữ được độ chính xác) sẽ trả về 400.
- Trong ứng dụng web, bạn có thể nhập `1,5` hoặc `1.5`, và các chữ số Ả Rập-Ấn hoặc Devanagari cũng dùng được. Dấu phân cách hàng nghìn không được chấp nhận.
