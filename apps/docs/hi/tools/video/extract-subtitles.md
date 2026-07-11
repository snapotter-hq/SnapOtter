---
description: "किसी वीडियो में से सबटाइटल ट्रैक को SRT फ़ाइल के रूप में निकालें।"
i18n_source_hash: 48db860f6676
i18n_provenance: human
i18n_output_hash: 9c76364d56c0
---

# Extract Subtitles {#extract-subtitles}

किसी वीडियो कंटेनर में से एम्बेडेड सबटाइटल ट्रैक निकालें और उसे SRT फ़ाइल के रूप में डाउनलोड करें।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/extract-subtitles`

एक वीडियो फ़ाइल के साथ multipart form data स्वीकार करता है। इस टूल में कोई समायोज्य सेटिंग नहीं है।

## Parameters {#parameters}

इस टूल में कोई पैरामीटर नहीं है। यह वीडियो कंटेनर में मिले पहले सबटाइटल ट्रैक को निकालता है।

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/extract-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.srt",
  "originalSize": 12500000,
  "processedSize": 4500
}
```

## Notes {#notes}

- वीडियो में एक एम्बेडेड सबटाइटल ट्रैक होना चाहिए। यदि कोई सबटाइटल ट्रैक नहीं मिलता, तो अनुरोध 400 त्रुटि लौटाता है।
- यदि वीडियो में कई सबटाइटल ट्रैक हैं, तो पहला निकाला जाता है।
- कंटेनर में मूल सबटाइटल फ़ॉर्मैट चाहे जो भी हो, आउटपुट फ़ॉर्मैट SRT ही होता है।
