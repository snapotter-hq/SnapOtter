---
description: "फ़्रेम मेटाडेटा के साथ कई छवियों को एक अकेली स्प्राइट शीट ग्रिड में संयोजित करें।"
i18n_source_hash: 1938d7fb100d
i18n_provenance: human
i18n_output_hash: 23631f6601fe
---

# Sprite Sheet {#sprite-sheet}

कई छवियों को एक अकेली स्प्राइट शीट ग्रिड में संयोजित करें। प्रत्येक छवि को पहली छवि के आयामों से मिलान करने के लिए आकार बदला जाता है और ग्रिड में रखा जाता है। प्रति-फ़्रेम कोऑर्डिनेट मेटाडेटा के साथ स्प्राइट शीट छवि लौटाता है।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/sprite-sheet`

दो या अधिक image फ़ाइलों और एक JSON `settings` फ़ील्ड के साथ multipart फ़ॉर्म डेटा स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| columns | integer | No | `4` | ग्रिड में स्तंभों की संख्या (1-16) |
| padding | integer | No | `0` | पिक्सेल में कोशिकाओं के बीच पैडिंग (0-64) |
| background | string | No | `"#ffffff"` | बैकग्राउंड हेक्स रंग |
| format | string | No | `"png"` | आउटपुट फ़ॉर्मेट: `png`, `webp`, या `jpeg` |
| quality | integer | No | `90` | आउटपुट गुणवत्ता (1-100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/sprite-sheet \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@frame1.png" \
  -F "file=@frame2.png" \
  -F "file=@frame3.png" \
  -F "file=@frame4.png" \
  -F 'settings={"columns": 2, "padding": 4, "format": "png"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/sprite-sheet.png",
  "originalSize": 120000,
  "processedSize": 95000,
  "frames": [
    { "index": 0, "left": 0, "top": 0, "width": 128, "height": 128 },
    { "index": 1, "left": 132, "top": 0, "width": 128, "height": 128 },
    { "index": 2, "left": 0, "top": 132, "width": 128, "height": 128 },
    { "index": 3, "left": 132, "top": 132, "width": 128, "height": 128 }
  ],
  "cols": 2,
  "rows": 2,
  "cellWidth": 128,
  "cellHeight": 128,
  "canvasWidth": 260,
  "canvasHeight": 260
}
```

## Notes {#notes}

- 2 से 64 छवियाँ स्वीकार करता है। सभी छवियों को पहली अपलोड की गई छवि के आयामों से मिलान करने के लिए आकार बदला जाता है।
- `frames` ऐरे आउटपुट में प्रत्येक फ़्रेम के सटीक पिक्सेल कोऑर्डिनेट प्रदान करती है, जो CSS स्प्राइट परिभाषाओं या गेम इंजन फ़्रेम मैप के लिए उपयुक्त है।
- पंक्तियों की संख्या छवि गणना और `columns` मान से स्वचालित रूप से परिकलित होती है।
- कोशिकाओं के बीच स्पेसिंग जोड़ने के लिए `padding` पैरामीटर का उपयोग करें। `background` रंग पैडिंग क्षेत्रों और किसी भी खाली अनुगामी कोशिकाओं में दिखाई देता है।
- HEIC, RAW, PSD, और SVG इनपुट प्रोसेसिंग से पहले स्वचालित रूप से डिकोड किए जाते हैं।
