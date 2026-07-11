---
description: "किसी audio फ़ाइल को उलट दें ताकि वह पीछे की ओर चले।"
i18n_source_hash: 5c2017661803
i18n_provenance: human
i18n_output_hash: 48abc0302214
---

# Reverse Audio {#reverse-audio}

किसी audio फ़ाइल को उलट दें ताकि वह पीछे की ओर चले।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/reverse-audio`

एक audio फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

इस टूल में कोई कॉन्फ़िगर करने योग्य पैरामीटर नहीं है। पूरी audio फ़ाइल उलट दी जाती है।

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/reverse-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3"
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

- पूरा audio ट्रैक अंत से आरंभ तक उलट दिया जाता है।
- आउटपुट आमतौर पर इनपुट container रखता है। AAC इनपुट M4A के रूप में लिखा जाता है, और असमर्थित डिकोड-ओनली इनपुट MP3 पर वापस चले जाते हैं।
