---
description: "Trích xuất track phụ đề từ video thành file SRT, WebVTT hoặc ASS."
i18n_source_hash: 5af4dad67936
i18n_provenance: machine
i18n_output_hash: 6e5e2ba151b4
i18n_hash_version: 2
---

# Extract Subtitles {#extract-subtitles}

Trích xuất track phụ đề nhúng từ một container video và tải xuống dưới dạng file SRT, WebVTT hoặc ASS.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/extract-subtitles`

Nhận multipart form data gồm một file video và một chuỗi JSON `settings` tùy chọn.

## Parameters {#parameters}

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `format` | string | `"srt"` | Định dạng đầu ra: `srt`, `vtt` (WebVTT) hoặc `ass` |

Track phụ đề đầu tiên tìm thấy trong container video sẽ được trích xuất.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/extract-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"format":"vtt"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.vtt",
  "originalSize": 12500000,
  "processedSize": 4500
}
```

## Notes {#notes}

- Video phải chứa một track phụ đề nhúng. Nếu không tìm thấy track phụ đề nào, yêu cầu trả về lỗi 400.
- Nếu video có nhiều track phụ đề, track đầu tiên sẽ được trích xuất.
- Các track văn bản (SubRip, ASS, mov_text, WebVTT) có thể chuyển sang bất kỳ định dạng nào trong ba định dạng đầu ra. Chuyển track ASS sang SRT hoặc WebVTT sẽ làm mất vị trí hiển thị và hiệu ứng của nó.
- Các track dạng hình ảnh (Blu-ray PGS, DVD VobSub) không thể chuyển thành văn bản nếu không có OCR và sẽ trả về lỗi 422.
