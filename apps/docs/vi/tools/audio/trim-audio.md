---
description: "Cắt một đoạn ra khỏi tệp âm thanh bằng cách chỉ định thời gian bắt đầu và kết thúc."
i18n_source_hash: f8d0b6a84592
i18n_provenance: machine
i18n_output_hash: ad741ffaf886
i18n_hash_version: 2
---

# Trim Audio {#trim-audio}

Cắt một đoạn ra khỏi tệp âm thanh. Bạn có thể giữ phần nằm giữa thời gian bắt đầu và kết thúc, hoặc cắt bớt một lượng cố định ở đầu và cuối.

Trong ứng dụng, các trường thời gian nhận số giây thuần (`90`), `MM:SS` (`1:30`) hoặc `HH:MM:SS` (`1:02:03.5`). API nhận số giây.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/trim-audio`

Nhận dữ liệu multipart form với một tệp âm thanh và một trường JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `range` | `range` giữ từ `startS` đến `endS`. `ends` xóa `cutStartS` ở đầu và `cutEndS` ở cuối |
| startS | number | No | `0` | Chế độ range: thời gian bắt đầu tính bằng giây (tối thiểu 0) |
| endS | number | Range mode | - | Chế độ range: thời gian kết thúc tính bằng giây (phải sau thời gian bắt đầu) |
| cutStartS | number | No | `0` | Chế độ ends: số giây cần xóa ở đầu |
| cutEndS | number | No | `0` | Chế độ ends: số giây cần xóa ở cuối |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/trim-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"startS": 10, "endS": 45}'
```

Cắt 2 giây đầu và 3 giây cuối, bất kể độ dài của tệp:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/trim-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "ends", "cutStartS": 2, "cutEndS": 3}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 1575000
}
```

## Notes {#notes}

- Thời gian được chỉ định bằng giây và có thể bao gồm phần thập phân (ví dụ `10.5`).
- Ở chế độ range, `endS` phải lớn hơn `startS`. Nếu `endS` vượt quá thời lượng âm thanh, tệp sẽ được cắt đến cuối.
- Ở chế độ ends, ít nhất một trong hai giá trị `cutStartS` và `cutEndS` phải lớn hơn không, và phần còn lại sau khi cắt phải dài ít nhất 0,1 giây âm thanh. Vì phần cắt được tính theo độ dài của từng tệp, một thiết lập duy nhất dùng được cho cả lô tệp có thời lượng khác nhau.
- Đầu ra thường giữ nguyên container của tệp đầu vào. Đầu vào AAC được ghi thành M4A, còn các đầu vào chỉ giải mã được nhưng không hỗ trợ sẽ chuyển về MP3.
