---
description: "AI का उपयोग करके छवि की पृष्ठभूमि को एक ठोस रंग या ग्रेडिएंट से बदलें।"
i18n_source_hash: 930fe8890e55
i18n_provenance: human
i18n_output_hash: 0eeee903fd14
---

# Background Replace {#background-replace}

किसी छवि की पृष्ठभूमि को एक ठोस रंग या ग्रेडिएंट से बदलें। AI मॉडल विषय का पता लगाता है, मूल पृष्ठभूमि हटाता है, और विषय को आपकी चुनी हुई पृष्ठभूमि पर कंपोज़िट करता है।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/background-replace`

एक छवि फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| backgroundType | string | No | `"color"` | पृष्ठभूमि मोड: `color` या `gradient` |
| color | string | No | `"#ffffff"` | पृष्ठभूमि हेक्स रंग (जब backgroundType `color` हो) |
| gradientColor1 | string | No | - | पहला ग्रेडिएंट हेक्स रंग |
| gradientColor2 | string | No | - | दूसरा ग्रेडिएंट हेक्स रंग |
| gradientAngle | integer | No | `180` | डिग्री में ग्रेडिएंट कोण (0-360) |
| feather | integer | No | `0` | एज फ़ेदरिंग त्रिज्या (0-20) |
| format | string | No | `"png"` | आउटपुट प्रारूप: `png` या `webp` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/background-replace \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"backgroundType": "color", "color": "#2563eb", "feather": 2}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

`GET /api/v1/jobs/{jobId}/progress` पर SSE के ज़रिए प्रगति ट्रैक करें। जब जॉब पूरा होता है, तो SSE स्ट्रीम डाउनलोड URL के साथ एक `completed` इवेंट उत्सर्जित करता है।

## Notes {#notes}

- यह एक AI-संचालित टूल है जो `202 Accepted` लौटाता है और असिंक्रोनस रूप से प्रोसेस करता है। प्रगति अपडेट और अंतिम परिणाम प्राप्त करने के लिए SSE एंडपॉइंट से कनेक्ट करें।
- इसके लिए **background-removal** फ़ीचर बंडल का इंस्टॉल होना आवश्यक है। यदि बंडल उपलब्ध नहीं है तो `501` लौटाता है।
- HEIC, RAW, PSD, और SVG इनपुट को प्रोसेसिंग से पहले स्वचालित रूप से डिकोड किया जाता है।
- विषय के चारों ओर पारदर्शिता संरक्षित करने के लिए आउटपुट PNG पर डिफ़ॉल्ट होता है।
