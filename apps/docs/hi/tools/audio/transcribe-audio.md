---
description: "AI-संचालित ट्रांसक्रिप्शन के साथ भाषण को टेक्स्ट में बदलें।"
i18n_source_hash: ae98c4c0aed2
i18n_provenance: human
i18n_output_hash: c23f7caac668
---

# Transcribe Audio {#transcribe-audio}

AI-संचालित ट्रांसक्रिप्शन (faster-whisper) का उपयोग करके भाषण को टेक्स्ट में बदलें। स्वचालित या मैनुअल भाषा चयन के साथ plain text, SRT, और VTT आउटपुट फ़ॉर्मेट का समर्थन करता है।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/transcribe-audio`

एक ऑडियो फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| language | string | No | `"auto"` | भाषा: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| outputFormat | string | No | `"txt"` | आउटपुट फ़ॉर्मेट: `txt`, `srt`, `vtt` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/transcribe-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"language": "en", "outputFormat": "srt"}'
```

## Example Response {#example-response}

यह एक async टूल है। API तुरंत `202 Accepted` लौटाता है:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

`GET /api/v1/jobs/{jobId}/progress` पर SSE के माध्यम से प्रगति को ट्रैक करें। जब job पूरी हो जाती है, तो SSE स्ट्रीम एक `downloadUrl` के साथ अंतिम परिणाम प्रदान करता है।

## Notes {#notes}

- **transcription** फ़ीचर बंडल को इंस्टॉल करने की आवश्यकता है। यदि बंडल उपलब्ध नहीं है तो कोड `FEATURE_NOT_INSTALLED`, गायब `feature`, `featureName`, और `estimatedSize` के साथ `501` लौटाता है।
- ट्रांसक्रिप्शन के लिए faster-whisper का उपयोग करता है। भाषा `auto` स्वचालित रूप से बोली गई भाषा का पता लगाती है।
- `srt` और `vtt` फ़ॉर्मेट प्रत्येक खंड के लिए टाइमस्टैम्प शामिल करते हैं, जो सबटाइटल के लिए उपयुक्त हैं।
- `txt` फ़ॉर्मेट बिना टाइमस्टैम्प के plain text लौटाता है।
- यह एक लंबे समय तक चलने वाला AI टूल है; प्रोसेसिंग समय ऑडियो की लंबाई और सर्वर हार्डवेयर पर निर्भर करता है।
