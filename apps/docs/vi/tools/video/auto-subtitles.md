---
description: "Tạo tệp phụ đề từ bản âm thanh của video bằng AI."
i18n_source_hash: 35b1e78501ad
i18n_provenance: human
i18n_output_hash: df3eead3b365
---

# Auto Subtitles {#auto-subtitles}

Tạo tệp phụ đề từ bản âm thanh của một video bằng nhận dạng giọng nói hỗ trợ AI (faster-whisper). Hỗ trợ tự động phát hiện và 10 ngôn ngữ được chỉ định rõ ràng.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/auto-subtitles`

Chấp nhận dữ liệu biểu mẫu multipart với một tệp video và một trường JSON `settings`. Đây là một endpoint bất đồng bộ - nó trả về `202 Accepted` ngay lập tức và tiến độ được truyền qua SSE tại `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| language | string | Không | `"auto"` | Ngôn ngữ giọng nói: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| format | string | Không | `"srt"` | Định dạng phụ đề đầu ra: `srt`, `vtt` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/auto-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"language": "en", "format": "srt"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Đây là một công cụ AI yêu cầu cài đặt gói tính năng **transcription**. Nếu gói chưa được cài đặt, API trả về `501 Feature Not Installed` cùng hướng dẫn cài đặt nó qua giao diện quản trị.
- Tùy chọn ngôn ngữ `auto` dùng khả năng phát hiện ngôn ngữ tích hợp sẵn của whisper. Chỉ định ngôn ngữ rõ ràng cải thiện độ chính xác và tốc độ.
- SRT là định dạng phụ đề được hỗ trợ rộng rãi nhất. VTT (WebVTT) là tiêu chuẩn cho các trình phát video web.
- Cập nhật tiến độ có sẵn qua SSE tại `GET /api/v1/jobs/{jobId}/progress` cho đến khi công việc hoàn thành.
