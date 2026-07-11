---
description: "Chuyển giọng nói thành văn bản bằng phiên âm hỗ trợ AI."
i18n_source_hash: ae98c4c0aed2
i18n_provenance: human
i18n_output_hash: 1d62713737af
---

# Transcribe Audio {#transcribe-audio}

Chuyển giọng nói thành văn bản bằng phiên âm hỗ trợ AI (faster-whisper). Hỗ trợ các định dạng đầu ra văn bản thuần túy, SRT và VTT với lựa chọn ngôn ngữ tự động hoặc thủ công.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/transcribe-audio`

Nhận dữ liệu multipart form với một tệp âm thanh và một trường JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| language | string | No | `"auto"` | Ngôn ngữ: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| outputFormat | string | No | `"txt"` | Định dạng đầu ra: `txt`, `srt`, `vtt` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/transcribe-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"language": "en", "outputFormat": "srt"}'
```

## Example Response {#example-response}

Đây là một công cụ bất đồng bộ. API trả về `202 Accepted` ngay lập tức:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

Theo dõi tiến trình qua SSE tại `GET /api/v1/jobs/{jobId}/progress`. Khi tác vụ hoàn tất, luồng SSE gửi kết quả cuối cùng kèm theo một `downloadUrl`.

## Notes {#notes}

- Yêu cầu cài đặt gói tính năng **transcription**. Trả về `501` với mã `FEATURE_NOT_INSTALLED`, cùng `feature`, `featureName` và `estimatedSize` còn thiếu nếu gói không khả dụng.
- Sử dụng faster-whisper để phiên âm. Ngôn ngữ `auto` tự động phát hiện ngôn ngữ được nói.
- Các định dạng `srt` và `vtt` bao gồm dấu thời gian cho từng đoạn, phù hợp làm phụ đề.
- Định dạng `txt` trả về văn bản thuần túy không có dấu thời gian.
- Đây là một công cụ AI chạy lâu; thời gian xử lý phụ thuộc vào độ dài âm thanh và phần cứng máy chủ.
