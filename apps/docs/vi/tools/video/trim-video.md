---
description: "Cắt một clip ra khỏi video bằng cách chỉ định thời điểm bắt đầu và kết thúc."
i18n_source_hash: 0385b4e963d0
i18n_provenance: machine
i18n_output_hash: 0860e3e4766f
i18n_hash_version: 2
---

# Trim Video {#trim-video}

Cắt một clip ra khỏi video. Bạn có thể giữ phần nằm giữa thời điểm bắt đầu và kết thúc, hoặc cắt bỏ một khoảng cố định ở đầu và cuối. Có sẵn tùy chọn cắt chính xác theo khung hình.

Trong ứng dụng, các trường thời gian nhận số giây thuần (`90`), `MM:SS` (`1:30`) hoặc `HH:MM:SS` (`1:02:03.5`). API nhận số giây.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/trim-video`

Nhận multipart form data gồm một file video và một trường JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `range` | `range` giữ phần từ `startS` đến `endS`. `ends` cắt bỏ `cutStartS` ở đầu và `cutEndS` ở cuối |
| startS | number | No | `0` | Chế độ phạm vi: thời điểm bắt đầu tính bằng giây (phải >= 0) |
| endS | number | Range mode | - | Chế độ phạm vi: thời điểm kết thúc tính bằng giây (phải sau startS) |
| cutStartS | number | No | `0` | Chế độ đầu cuối: số giây cần cắt bỏ ở đầu |
| cutEndS | number | No | `0` | Chế độ đầu cuối: số giây cần cắt bỏ ở cuối |
| precise | boolean | No | `false` | Mã hóa lại toàn bộ phạm vi để khung hình đầu và cuối chính xác, thay vì sao chép từ keyframe kế tiếp |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/trim-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"startS": 5, "endS": 30, "precise": true}'
```

Cắt 5 giây đầu và 10 giây cuối, bất kể độ dài video:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/trim-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"mode": "ends", "cutStartS": 5, "cutEndS": 10}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 4200000
}
```

## Notes {#notes}

- Khi `precise` là `false` (mặc định), clip bắt đầu đúng tại khung hình bạn yêu cầu. Chỉ các khung hình từ điểm bắt đầu đó đến keyframe kế tiếp được mã hóa lại, phần còn lại được sao chép, nên tốc độ vẫn nhanh. Phần kết thúc có thể dài hơn khoảng một khung hình, vì luồng được sao chép giữ lại các khung hình mà những khung hình trước đó phụ thuộc vào. Các nguồn không thể ghép an toàn theo cách này (H.264 10-bit hoặc interlaced, các codec khác cần mã hóa lại phần đầu, hoặc các file AVI, FLV, MPEG và TS) sẽ được mã hóa lại toàn bộ.
- Đặt `precise` thành `true` sẽ luôn mã hóa lại toàn bộ phạm vi, nên cả hai đầu đều chính xác, nhưng mất nhiều thời gian hơn.
- Ở chế độ phạm vi, `endS` phải lớn hơn `startS`. Nếu `endS` vượt quá phần cuối video, clip sẽ chạy đến hết video.
- Ở chế độ đầu cuối, ít nhất một trong hai giá trị `cutStartS` và `cutEndS` phải lớn hơn không, và cộng lại chúng phải để lại một phần video. Vì phần cắt được tính theo độ dài của từng file, một thiết lập duy nhất dùng được cho cả loạt video có thời lượng khác nhau.
