---
description: "किसी वीडियो से फ्रेम को छवियों के ZIP के रूप में निकालें।"
i18n_source_hash: b06f038dafb3
i18n_provenance: human
i18n_output_hash: e36d1f752c58
---

# Video to Frames {#video-to-frames}

किसी वीडियो से अलग-अलग फ्रेम निकालें और उन्हें PNG या JPG छवियों के ZIP आर्काइव के रूप में डाउनलोड करें।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-frames`

एक वीडियो फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"all"` | निष्कर्षण मोड: `all`, `nth`, `timestamps` |
| n | integer | No | `10` | हर Nवाँ फ्रेम निकालें (2-1000)। केवल तब उपयोग होता है जब mode `"nth"` हो |
| timestamps | string | No | `""` | सेकंड में अल्पविराम-पृथक टाइमस्टैम्प। तब आवश्यक जब mode `"timestamps"` हो |
| format | string | No | `"png"` | निकाले गए फ्रेम के लिए छवि फ़ॉर्मैट: `png`, `jpg` |

## Example Request {#example-request}

हर 30वाँ फ्रेम JPG के रूप में निकालें:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-frames \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"mode": "nth", "n": 30, "format": "jpg"}'
```

विशिष्ट टाइमस्टैम्प पर फ्रेम निकालें:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-frames \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"mode": "timestamps", "timestamps": "1.5,5,12.3"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip-frames.zip",
  "originalSize": 12500000,
  "processedSize": 45000000
}
```

## Notes {#notes}

- `all` मोड हर फ्रेम निकालता है और लंबे वीडियो के लिए बहुत बड़ी ZIP फ़ाइलें बना सकता है। चयनात्मक निष्कर्षण के लिए `nth` या `timestamps` मोड का उपयोग करें।
- PNG पूरी गुणवत्ता बनाए रखता है लेकिन बड़ी फ़ाइलें बनाता है। JPG छोटा है लेकिन लॉसी है।
- प्रतिक्रिया क्रमिक रूप से क्रमांकित छवि फ़ाइलों वाले ZIP आर्काइव के रूप में डाउनलोड होती है।
