---
description: "किसी वीडियो से मेटाडेटा हटाएँ और जो मिला उसकी रिपोर्ट दें।"
i18n_source_hash: 69621bfb98ca
i18n_provenance: human
i18n_output_hash: 7f1c6d1f6121
---

# Clean Video Metadata {#clean-video-metadata}

किसी वीडियो से मेटाडेटा (निर्माण तिथि, GPS निर्देशांक, कैमरा मॉडल, सॉफ़्टवेयर टैग, आदि) हटाएँ और जो हटाया गया उसकी रिपोर्ट दें।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-metadata`

एक वीडियो फ़ाइल के साथ multipart form data स्वीकार करता है। इस टूल में कोई समायोज्य सेटिंग नहीं है।

## Parameters {#parameters}

इस टूल में कोई पैरामीटर नहीं है। यह वीडियो कंटेनर से सभी मेटाडेटा हटा देता है।

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip_clean.mp4",
  "originalSize": 12500000,
  "processedSize": 12480000,
  "metadata": {
    "container": "mov,mp4,m4a,3gp,3g2,mj2",
    "durationS": 42.5,
    "bitrateKbps": 2350,
    "streams": [
      { "type": "video", "codec": "h264", "width": 1920, "height": 1080 },
      { "type": "audio", "codec": "aac", "sampleRate": 48000 }
    ]
  }
}
```

## Notes {#notes}

- हटाए गए मेटाडेटा में निर्माण टाइमस्टैम्प, GPS/स्थान डेटा, कैमरा/डिवाइस जानकारी, और सॉफ़्टवेयर टैग शामिल हैं।
- वीडियो और ऑडियो स्ट्रीम को फिर से एन्कोड किए बिना कॉपी किया जाता है, इसलिए कोई गुणवत्ता हानि नहीं होती।
- वीडियो सार्वजनिक रूप से साझा करने से पहले गोपनीयता के लिए उपयोगी।
