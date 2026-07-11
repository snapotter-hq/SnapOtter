---
description: "किसी सबटाइटल ट्रैक को वीडियो कंटेनर में mux करें।"
i18n_source_hash: be272730fff5
i18n_provenance: human
i18n_output_hash: 0ce7554cd7f8
---

# Embed Subtitles {#embed-subtitles}

एक सबटाइटल फ़ाइल को वीडियो कंटेनर में एक सॉफ़्ट सबटाइटल ट्रैक के रूप में mux करें, जिसे दर्शक चालू या बंद कर सकते हैं।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/embed-subtitles`

एक वीडियो फ़ाइल और एक सबटाइटल फ़ाइल के साथ, तथा एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| language | string | No | `"eng"` | ISO 639-2/B भाषा कोड (3 छोटे अक्षर, जैसे `"eng"`, `"fra"`, `"deu"`) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/embed-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F "file=@subtitles.srt" \
  -F 'settings={"language": "fra"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12520000
}
```

## Notes {#notes}

- दो फ़ाइलें अपलोड करें: पहली एक वीडियो होनी चाहिए, दूसरी एक सबटाइटल फ़ाइल (.srt, .vtt, या .ass) होनी चाहिए।
- एम्बेडेड (सॉफ़्ट) सबटाइटल को दर्शक अपने मीडिया प्लेयर में टॉगल कर सकते हैं। स्थायी रूप से दिखने वाले सबटाइटल के लिए, इसके बजाय Burn Subtitles टूल का उपयोग करें।
- भाषा कोड कंटेनर में मेटाडेटा के रूप में संग्रहीत होता है और मीडिया प्लेयर को सबटाइटल ट्रैक लेबल करने में मदद करता है।
