---
description: "किसी एनिमेटेड GIF को MP4, WebM, या MOV वीडियो में कन्वर्ट करें।"
i18n_source_hash: c3737b31146d
i18n_provenance: human
i18n_output_hash: 0cf6a01636bf
---

# GIF to Video {#gif-to-video}

किसी एनिमेटेड GIF को एक सुगठित MP4, WebM, या MOV वीडियो फ़ाइल में कन्वर्ट करें।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/gif-to-video`

एक GIF फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp4"` | आउटपुट फ़ॉर्मैट: `mp4`, `webm`, `mov` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/gif-to-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@animation.gif" \
  -F 'settings={"format": "mp4"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/animation.mp4",
  "originalSize": 8500000,
  "processedSize": 950000
}
```

## Notes {#notes}

- GIF को वीडियो में कन्वर्ट करने से आम तौर पर वही दृश्य गुणवत्ता बनाए रखते हुए फ़ाइल आकार 80-90% तक घट जाता है।
- केवल एनिमेटेड GIF फ़ाइलें स्वीकार की जाती हैं। स्थिर छवियों के लिए image Convert टूल का उपयोग करें।
- MP4 और MOV H.264 encoding का उपयोग करते हैं, WebM VP9 का उपयोग करता है।
