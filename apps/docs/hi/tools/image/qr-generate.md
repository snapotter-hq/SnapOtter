---
description: "कस्टम रंगों और त्रुटि सुधार स्तरों के साथ QR कोड जनरेट करें।"
i18n_source_hash: 096ef4d90da5
i18n_provenance: human
i18n_output_hash: 65fae6246a5e
---

# QR Code Generator {#qr-code-generator}

कॉन्फ़िगर करने योग्य आकार, त्रुटि सुधार स्तर, और कस्टम अग्रभूमि/पृष्ठभूमि रंगों के साथ टेक्स्ट या URL से QR कोड इमेज जनरेट करें।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/qr-generate`

एक **JSON body** स्वीकार करता है (multipart नहीं)। किसी फ़ाइल अपलोड की आवश्यकता नहीं।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| text | string | Yes | - | QR कोड में एन्कोड करने के लिए सामग्री (1 से 2000 वर्ण) |
| size | number | No | `400` | पिक्सेल में आउटपुट इमेज चौड़ाई/ऊँचाई (100 से 10000) |
| errorCorrection | string | No | `"M"` | त्रुटि सुधार स्तर: `L` (7%), `M` (15%), `Q` (25%), `H` (30%) |
| foreground | string | No | `"#000000"` | QR कोड अग्रभूमि/मॉड्यूल रंग hex में (`#RRGGBB`) |
| background | string | No | `"#FFFFFF"` | QR कोड पृष्ठभूमि रंग hex में (`#RRGGBB`) |
| logoDataUri | string | No | - | लोगो इमेज एक data URI के रूप में (`data:image/png;base64,...` या `data:image/jpeg;base64,...`, अधिकतम 700 KB)। QR आकार के 22% पर QR कोड पर केंद्रित। त्रुटि सुधार को `H` पर बाध्य करता है |

### Error Correction Levels {#error-correction-levels}

| Level | Recovery | Use Case |
|-------|----------|----------|
| `L` | ~7% | अधिकतम डेटा घनत्व |
| `M` | ~15% | संतुलित (डिफ़ॉल्ट) |
| `Q` | ~25% | मुद्रित कोड के लिए अच्छा |
| `H` | ~30% | लोगो ओवरले वाले कोड के लिए सर्वोत्तम |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/qr-generate \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "https://snapotter.com", "size": 500, "errorCorrection": "H"}'
```

कस्टम रंगों के साथ ब्रांडेड QR कोड:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/qr-generate \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello World", "size": 300, "foreground": "#1a365d", "background": "#f7fafc"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/qrcode.png",
  "originalSize": 0,
  "processedSize": 4520
}
```

## Notes {#notes}

- यह एंडपॉइंट JSON स्वीकार करता है, multipart form data नहीं, क्योंकि किसी इमेज अपलोड की आवश्यकता नहीं है।
- आउटपुट हमेशा एक PNG इमेज होता है।
- आउटपुट फ़ाइल नाम हमेशा `qrcode.png` होता है।
- `originalSize` हमेशा 0 होता है क्योंकि यह टूल इमेज को शून्य से जनरेट करता है।
- QR कोड के चारों ओर एक 2-मॉड्यूल क्वाइट ज़ोन (मार्जिन) शामिल होता है।
- अधिकतम टेक्स्ट लंबाई 2000 वर्ण है। वास्तविक क्षमता त्रुटि सुधार स्तर और वर्ण एन्कोडिंग पर निर्भर करती है।
- उच्च त्रुटि सुधार स्तर QR कोड को आंशिक रूप से छिपे होने पर भी स्कैन करने योग्य बने रहने की अनुमति देते हैं लेकिन डेटा क्षमता को कम करते हैं।
- जब कोई `logoDataUri` प्रदान किया जाता है, तो त्रुटि सुधार स्वतः `H` (30%) पर बाध्य हो जाता है ताकि लोगो द्वारा केंद्र को ढकने के बावजूद QR कोड स्कैन करने योग्य बना रहे।
