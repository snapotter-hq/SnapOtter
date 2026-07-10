---
description: "FFT-आधारित डिनॉइज़िंग के साथ audio से बैकग्राउंड नॉइज़ कम करें।"
i18n_source_hash: 57cbdbd449aa
i18n_provenance: human
i18n_output_hash: d21cd21ac378
---

# Noise Reduction {#noise-reduction}

चयन योग्य ताकत के साथ FFT-आधारित डिनॉइज़िंग का उपयोग करके किसी audio फ़ाइल में बैकग्राउंड नॉइज़ कम करें।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/noise-reduction`

एक audio फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| strength | string | No | `"medium"` | डिनॉइज़िंग ताकत: `light`, `medium`, `strong` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/noise-reduction \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"strength": "strong"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4500000
}
```

## Notes {#notes}

- `light` अधिक विवरण संरक्षित करता है लेकिन कम नॉइज़ हटाता है। `strong` अधिक नॉइज़ हटाता है लेकिन सूक्ष्म आर्टिफ़ैक्ट पैदा कर सकता है।
- सुसंगत बैकग्राउंड नॉइज़ (पंखे की गूँज, एयर कंडीशनिंग, स्थैतिक) वाली रिकॉर्डिंग पर सर्वोत्तम परिणाम।
- आउटपुट आमतौर पर इनपुट container रखता है। AAC इनपुट M4A के रूप में लिखा जाता है, और असमर्थित डिकोड-ओनली इनपुट MP3 पर वापस चले जाते हैं।
