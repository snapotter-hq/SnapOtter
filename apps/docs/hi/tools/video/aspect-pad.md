---
description: "लक्षित आस्पेक्ट रेशियो में फिट करने के लिए ठोस-रंग की पट्टियां जोड़ें।"
i18n_source_hash: b8e17dffc341
i18n_provenance: human
i18n_output_hash: f6f9bcc162d3
---

# Aspect Pad {#aspect-pad}

बिना क्रॉप किए किसी वीडियो को एक लक्षित आस्पेक्ट रेशियो में फिट करने के लिए ठोस-रंग की लेटरबॉक्स या पिलरबॉक्स पट्टियां जोड़ें।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/aspect-pad`

एक वीडियो फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| target | string | No | `"9:16"` | लक्षित आस्पेक्ट रेशियो: `16:9`, `9:16`, `1:1`, `4:3`, `3:4` |
| color | string | No | `"#000000"` | पैडिंग पट्टियों के लिए हेक्स रंग (उदा. काले के लिए `"#000000"`) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/aspect-pad \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"target": "1:1", "color": "#ffffff"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 13200000
}
```

## Notes {#notes}

- यदि वीडियो पहले से ही लक्षित आस्पेक्ट रेशियो से मेल खाता है, तो फ़ाइल अपरिवर्तित लौटाई जाती है।
- वर्टिकल/पोर्ट्रेट सोशल मीडिया फ़ॉर्मेट (TikTok, Reels, Shorts) के लिए `9:16` का उपयोग करें।
- ठोस रंग के बजाय धुंधली पैडिंग के लिए, Blur Pad टूल का उपयोग करें।
