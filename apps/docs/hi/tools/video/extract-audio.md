---
description: "किसी वीडियो में से ऑडियो ट्रैक निकालें।"
i18n_source_hash: f5b8330a5f89
i18n_provenance: human
i18n_output_hash: 016d26cec631
---

# Extract Audio {#extract-audio}

किसी वीडियो फ़ाइल में से ऑडियो ट्रैक निकालें और उसे MP3, WAV, M4A, या OGG के रूप में सहेजें।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/extract-audio`

एक वीडियो फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp3"` | आउटपुट ऑडियो फ़ॉर्मैट: `mp3`, `wav`, `m4a`, `ogg` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/extract-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"format": "mp3"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp3",
  "originalSize": 12500000,
  "processedSize": 3200000
}
```

## Notes {#notes}

- यदि वीडियो में कोई ऑडियो ट्रैक नहीं है, तो अनुरोध 400 त्रुटि लौटाता है।
- MP3 लॉसी है लेकिन व्यापक रूप से संगत है। WAV लॉसलेस है लेकिन बड़ा है। M4A (AAC) गुणवत्ता और आकार का अच्छा संतुलन देता है। OGG ओपन कोडेक वर्कफ़्लो के लिए उपलब्ध है।
- जब स्रोत ऑडियो पहले से ही AAC हो और आउटपुट फ़ॉर्मैट M4A हो, तो ऑडियो स्ट्रीम को फिर से एन्कोड किए बिना कॉपी किया जाता है।
