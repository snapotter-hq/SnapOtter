---
description: "ड्रॉप शैडो और बैकग्राउंड बॉक्स के साथ स्टाइल किए गए टेक्स्ट ओवरले जोड़ें।"
i18n_source_hash: 9f8e697188fc
i18n_provenance: human
i18n_output_hash: 54ad7e2be905
---

# Text Overlay {#text-overlay}

वैकल्पिक ड्रॉप शैडो और अर्ध-पारदर्शी बैकग्राउंड बॉक्स के साथ छवियों में स्टाइल किया गया टेक्स्ट जोड़ें। फ़ोटो पर शीर्षकों, कैप्शन, या एनोटेशन के लिए उपयुक्त।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/text-overlay`

एक image फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart फ़ॉर्म डेटा स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| text | string | Yes | - | ओवरले करने के लिए टेक्स्ट (1 से 500 वर्ण) |
| fontSize | number | No | `48` | पिक्सेल में फ़ॉन्ट आकार (8 से 200) |
| color | string | No | `"#FFFFFF"` | हेक्स फ़ॉर्मेट में टेक्स्ट रंग (`#RRGGBB`) |
| position | string | No | `"bottom"` | लंबवत स्थान: `top`, `center`, `bottom` |
| backgroundBox | boolean | No | `false` | टेक्स्ट के पीछे एक अर्ध-पारदर्शी बैकग्राउंड आयत दिखाएँ |
| backgroundColor | string | No | `"#000000"` | हेक्स फ़ॉर्मेट में बैकग्राउंड बॉक्स रंग (`#RRGGBB`) |
| shadow | boolean | No | `true` | टेक्स्ट के पीछे एक ड्रॉप शैडो लागू करें |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/text-overlay \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "Hello World", "fontSize": 64, "color": "#FFFFFF", "position": "bottom", "shadow": true}'
```

बैकग्राउंड बॉक्स के साथ:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/text-overlay \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "Caption", "fontSize": 36, "position": "bottom", "backgroundBox": true, "backgroundColor": "#000000"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2470000
}
```

## Notes {#notes}

- टेक्स्ट हमेशा छवि के भीतर क्षैतिज रूप से केंद्रित होता है।
- ड्रॉप शैडो 70% काली अपारदर्शिता पर 3px ब्लर के साथ 2px ऑफ़सेट का उपयोग करता है।
- बैकग्राउंड बॉक्स 70% अपारदर्शिता पर पूरी छवि चौड़ाई में फैला होता है, जिसकी ऊँचाई फ़ॉन्ट आकार के समानुपाती (1.8x) होती है।
- टेक्स्ट को SVG कंपोजिट के माध्यम से रेंडर किया जाता है, इसलिए सिस्टम का डिफ़ॉल्ट sans-serif फ़ॉन्ट उपयोग किया जाता है।
- टेक्स्ट में XML-विशेष वर्णों को सुरक्षित रूप से एस्केप किया जाता है।
- आउटपुट फ़ॉर्मेट इनपुट फ़ॉर्मेट से मेल खाता है। HEIC, RAW, PSD, और SVG इनपुट प्रोसेसिंग से पहले स्वचालित रूप से डिकोड किए जाते हैं।
