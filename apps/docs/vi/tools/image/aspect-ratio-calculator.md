---
description: "Tính chiều rộng hoặc chiều cao còn thiếu để giữ nguyên tỷ lệ khung hình, và rút gọn tỷ lệ."
i18n_source_hash: 2f975049563e
i18n_provenance: machine
i18n_output_hash: eacf5cb24495
i18n_hash_version: 2
---

# Máy tính tỷ lệ khung hình {#aspect-ratio-calculator}

Nhập chiều rộng và chiều cao gốc, sau đó nhập chiều rộng mới hoặc chiều cao mới, và bạn sẽ nhận lại cạnh còn lại để giữ nguyên tỉ lệ. Tỷ lệ được trả về ở dạng đơn giản nhất, nên 1920 × 1080 là 16:9. Trong ứng dụng web, bạn có thể bắt đầu từ một tỷ lệ phổ biến (16:9, 4:3, 3:2, 1:1, 21:9, 9:16, 4:5) và chuyển đổi giữa ngang và dọc.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/aspect-ratio-calculator`

Chấp nhận một phần thân JSON, không phải dữ liệu biểu mẫu multipart, và trả về các con số thay vì một tệp để tải xuống.

## Parameters {#parameters}

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `width` | number | (bắt buộc) | Chiều rộng gốc. |
| `height` | number | (bắt buộc) | Chiều cao gốc. |
| `newWidth` | number | - | Chiều rộng mục tiêu. Phản hồi tính `newHeight` từ giá trị này. |
| `newHeight` | number | - | Chiều cao mục tiêu. Phản hồi tính `newWidth` từ giá trị này. |
| `round` | boolean | `true` | Làm tròn cạnh được tính thành số nguyên. Khi `false`, giữ lại hai chữ số thập phân. |

Mọi kích thước phải nằm trong khoảng từ `0.0001` đến `1000000`. Gửi `newWidth` hoặc `newHeight`, không gửi cả hai. Bỏ trống cả hai để chỉ nhận tỷ lệ đã rút gọn.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/aspect-ratio-calculator \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"width": 1920, "height": 1080, "newWidth": 1280}'
```

## Example Response {#example-response}

```json
{
  "width": 1920,
  "height": 1080,
  "ratio": "16:9",
  "ratioDecimal": 1.7778,
  "newWidth": 1280,
  "newHeight": 720
}
```

`newWidth` và `newHeight` là `null` khi yêu cầu không gửi giá trị nào trong hai giá trị đó.

## Notes {#notes}

- Kích thước có phần thập phân được rút gọn thành tỷ lệ số nguyên với tối đa bốn chữ số thập phân, nên `8.5` × `11` được trả về là `17:22`.
- `ratioDecimal` là chiều rộng chia cho chiều cao, làm tròn đến bốn chữ số thập phân.
- Cạnh được tính không bao giờ trả về là `0`. Khi bật làm tròn, giá trị tối thiểu là `1`, còn khi tắt làm tròn thì tối thiểu là `0.01`.
- Gửi cả `newWidth` và `newHeight`, hoặc một kích thước nằm ngoài phạm vi cho phép, sẽ trả về lỗi 400.
- Máy tính này không bao giờ đọc hoặc ghi tệp. Để áp dụng các con số, hãy dùng [Thay đổi kích thước ảnh](/vi/tools/image/resize) hoặc [Cắt ảnh](/vi/tools/image/crop).
