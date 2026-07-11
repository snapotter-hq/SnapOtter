---
description: "किसी वीडियो से ऑडियो ट्रैक हटाएँ।"
i18n_source_hash: 9a0c60bbcaa3
i18n_provenance: human
i18n_output_hash: 7d0b602b8ddb
---

# Mute Video {#mute-video}

किसी वीडियो से ऑडियो ट्रैक हटाएँ, केवल दृश्य स्ट्रीम छोड़ते हुए।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/mute-video`

एक वीडियो फ़ाइल के साथ multipart form data स्वीकार करता है। इस टूल में कोई समायोज्य सेटिंग नहीं है।

## Parameters {#parameters}

इस टूल में कोई पैरामीटर नहीं है। यह अपलोड किए गए वीडियो से ऑडियो ट्रैक हटा देता है।

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/mute-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 8900000
}
```

## Notes {#notes}

- वीडियो स्ट्रीम को फिर से एन्कोड किए बिना कॉपी किया जाता है, इसलिए कोई गुणवत्ता हानि नहीं होती।
- यदि इनपुट वीडियो में कोई ऑडियो ट्रैक नहीं है, तो फ़ाइल अपरिवर्तित लौटाई जाती है।
