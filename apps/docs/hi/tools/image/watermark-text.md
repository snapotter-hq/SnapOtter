---
description: "कॉन्फ़िगर करने योग्य स्थिति, अपारदर्शिता, रोटेशन, और टाइलिंग के साथ टेक्स्ट वॉटरमार्क जोड़ें।"
i18n_source_hash: b80f12f410e4
i18n_provenance: human
i18n_output_hash: 492db576f493
---

# Text Watermark {#text-watermark}

छवियों में एक टेक्स्ट वॉटरमार्क ओवरले जोड़ें। कोनों/केंद्र पर एकल स्थान या पूरी छवि में टाइल की गई पुनरावृत्ति का समर्थन करता है, जिसमें कॉन्फ़िगर करने योग्य फ़ॉन्ट आकार, रंग, अपारदर्शिता, और रोटेशन होता है।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/watermark-text`

एक image फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart फ़ॉर्म डेटा स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| text | string | Yes | - | वॉटरमार्क टेक्स्ट (1 से 500 वर्ण) |
| fontSize | number | No | `48` | पिक्सेल में फ़ॉन्ट आकार (8 से 1000) |
| color | string | No | `"#000000"` | हेक्स फ़ॉर्मेट में टेक्स्ट रंग (`#RRGGBB`) |
| opacity | number | No | `50` | टेक्स्ट अपारदर्शिता प्रतिशत (0 से 100) |
| position | string | No | `"center"` | स्थान: `center`, `top-left`, `top-right`, `bottom-left`, `bottom-right`, `tiled` |
| rotation | number | No | `0` | डिग्री में टेक्स्ट रोटेशन कोण (-360 से 360) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/watermark-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "SAMPLE", "fontSize": 64, "opacity": 30, "position": "center", "rotation": -30}'
```

पूरी छवि में टाइल किया गया वॉटरमार्क:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/watermark-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "DRAFT", "fontSize": 36, "opacity": 20, "position": "tiled", "rotation": -45}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2480000
}
```

## Notes {#notes}

- वॉटरमार्क को SVG टेक्स्ट के रूप में रेंडर किया जाता है और छवि पर कंपोजिट किया जाता है, जिससे आउटपुट गुणवत्ता संरक्षित रहती है।
- टाइल्ड मोड फ़ॉन्ट आकार (6x क्षैतिज, 4x लंबवत स्पेसिंग) के आधार पर टेक्स्ट तत्वों को स्थान देता है, जो अधिकतम 500 तत्वों पर सीमित है।
- कोने की स्थितियों के लिए, किनारे से पैडिंग फ़ॉन्ट आकार के बराबर होती है।
- उपयोग किया गया फ़ॉन्ट सिस्टम का डिफ़ॉल्ट sans-serif फ़ॉन्ट है।
- टेक्स्ट में XML-विशेष वर्णों (`&`, `<`, `>`, `"`, `'`) को सुरक्षित रूप से एस्केप किया जाता है।
- आउटपुट फ़ॉर्मेट इनपुट फ़ॉर्मेट से मेल खाता है। HEIC, RAW, PSD, और SVG इनपुट प्रोसेसिंग से पहले स्वचालित रूप से डिकोड किए जाते हैं।
