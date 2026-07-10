---
description: "MP4, MOV, WebM, AVI, और MKV के बीच वीडियो कन्वर्ट करें।"
i18n_source_hash: 8f9e6418b1c6
i18n_provenance: human
i18n_output_hash: 23c3b573d581
---

# Convert Video {#convert-video}

समायोज्य गुणवत्ता प्रीसेट के साथ MP4, MOV, WebM, AVI, और MKV फ़ॉर्मैट के बीच वीडियो कन्वर्ट करें।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/convert-video`

एक वीडियो फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है। यह एक async endpoint है - यह तुरंत `202 Accepted` लौटाता है और प्रगति `GET /api/v1/jobs/{jobId}/progress` पर SSE के माध्यम से स्ट्रीम की जाती है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp4"` | आउटपुट फ़ॉर्मैट: `mp4`, `mov`, `webm`, `avi`, `mkv` |
| quality | string | No | `"balanced"` | गुणवत्ता प्रीसेट: `high`, `balanced`, `small` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/convert-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"format": "webm", "quality": "balanced"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- `high` गुणवत्ता प्रीसेट सबसे अच्छी दृश्य निष्ठा देता है लेकिन बड़ी फ़ाइलें बनाता है। `small` प्रीसेट न्यूनतम फ़ाइल आकार के लिए आक्रामक रूप से संपीड़ित करता है।
- WebM आउटपुट VP9 encoding का उपयोग करता है। MP4 और MOV H.264 का उपयोग करते हैं। AVI और MKV लीगेसी या आर्काइवल वर्कफ़्लो के लिए उपलब्ध हैं।
- जॉब पूरा होने तक `GET /api/v1/jobs/{jobId}/progress` पर SSE के माध्यम से प्रगति अपडेट उपलब्ध रहते हैं।
