---
description: "AI का उपयोग करके वीडियो ऑडियो ट्रैक से सबटाइटल फ़ाइलें उत्पन्न करें।"
i18n_source_hash: 35b1e78501ad
i18n_provenance: human
i18n_output_hash: 707ba9de3360
---

# Auto Subtitles {#auto-subtitles}

AI-संचालित स्पीच रिकग्निशन (faster-whisper) का उपयोग करके किसी वीडियो के ऑडियो ट्रैक से सबटाइटल फ़ाइलें उत्पन्न करें। ऑटो-डिटेक्शन और 10 स्पष्ट भाषाओं का समर्थन करता है।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/auto-subtitles`

एक वीडियो फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है। यह एक async एंडपॉइंट है - यह तुरंत `202 Accepted` लौटाता है और प्रगति `GET /api/v1/jobs/{jobId}/progress` पर SSE के माध्यम से स्ट्रीम की जाती है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| language | string | No | `"auto"` | स्पीच भाषा: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| format | string | No | `"srt"` | आउटपुट सबटाइटल फ़ॉर्मेट: `srt`, `vtt` |

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

- यह एक AI टूल है जिसके लिए **transcription** फ़ीचर बंडल का इंस्टॉल होना आवश्यक है। यदि बंडल इंस्टॉल नहीं है, तो API इसे एडमिन UI के माध्यम से इंस्टॉल करने के निर्देशों के साथ `501 Feature Not Installed` लौटाता है।
- `auto` भाषा विकल्प whisper की अंतर्निहित भाषा पहचान का उपयोग करता है। भाषा को स्पष्ट रूप से निर्दिष्ट करने से सटीकता और गति बेहतर होती है।
- SRT सबसे व्यापक रूप से समर्थित सबटाइटल फ़ॉर्मेट है। VTT (WebVTT) वेब वीडियो प्लेयर के लिए मानक है।
- जॉब पूरा होने तक `GET /api/v1/jobs/{jobId}/progress` पर SSE के माध्यम से प्रगति अपडेट उपलब्ध हैं।
