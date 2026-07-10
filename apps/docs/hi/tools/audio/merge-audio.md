---
description: "कई audio फ़ाइलों को एक क्रमिक ट्रैक में संयोजित करें।"
i18n_source_hash: defa993d3f87
i18n_provenance: human
i18n_output_hash: be67ec06cb3c
---

# Merge Audio {#merge-audio}

दो या अधिक audio फ़ाइलों को एक ही क्रमिक ट्रैक में संयोजित करें, जिन्हें अपलोड के क्रम में जोड़ा जाता है।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/merge-audio`

कई audio फ़ाइलों और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp3"` | आउटपुट फ़ॉर्मैट: `mp3`, `wav`, `flac`, `m4a` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/merge-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@intro.mp3" \
  -F "file=@main.mp3" \
  -F "file=@outro.mp3" \
  -F 'settings={"format": "mp3"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.mp3",
  "originalSize": 9500000,
  "processedSize": 9200000
}
```

## Notes {#notes}

- प्रति अनुरोध 2 से 10 audio फ़ाइलें स्वीकार करता है।
- फ़ाइलें अपलोड क्रम में जोड़ी जाती हैं।
- निर्बाध जुड़ाव के लिए सभी इनपुट फ़ाइलें चुने गए आउटपुट फ़ॉर्मैट और सैंपल रेट में पुनः-एन्कोड की जाती हैं।
- मिश्रित इनपुट फ़ॉर्मैट समर्थित हैं (उदा. एक WAV और एक MP3)।
