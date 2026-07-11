---
description: "Kết xuất phụ đề vĩnh viễn lên các khung hình video."
i18n_source_hash: 2d3111589db0
i18n_provenance: human
i18n_output_hash: beecb810bd54
---

# Burn Subtitles {#burn-subtitles}

Kết xuất vĩnh viễn (hard-code) phụ đề từ file SRT, VTT hoặc ASS lên mọi khung hình của video.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/burn-subtitles`

Nhận multipart form data gồm một file video và một file phụ đề. Đây là endpoint bất đồng bộ - nó trả về `202 Accepted` ngay lập tức và tiến độ được truyền qua SSE tại `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fontSize | integer | No | `24` | Cỡ chữ phụ đề tính bằng pixel (8-72) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/burn-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F "file=@subtitles.srt" \
  -F 'settings={"fontSize": 28}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Tải lên hai file: file đầu tiên phải là video, file thứ hai phải là file phụ đề (.srt, .vtt hoặc .ass).
- Phụ đề đã burn là một phần vĩnh viễn của video và người xem không thể tắt được. Để có phụ đề bật/tắt được, hãy dùng công cụ Embed Subtitles.
- Cập nhật tiến độ có sẵn qua SSE tại `GET /api/v1/jobs/{jobId}/progress` cho đến khi tác vụ hoàn tất.
