---
description: "PDF के सभी पृष्ठों को मार्जिन से या किसी क्षेत्र तक क्रॉप करें।"
i18n_source_hash: 338ff7bb64e5
i18n_provenance: machine
i18n_output_hash: 6f8d3c02e8c1
i18n_hash_version: 2
---

# Crop PDF {#crop-pdf}

PDF के सभी पृष्ठों को हर किनारे पर एक मार्जिन से, प्रत्येक किनारे के अलग मार्जिन से, या किसी क्षेत्र तक क्रॉप करें, जैसे शीट के एक कोने में छपा शिपिंग लेबल।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/crop-pdf`

एक PDF फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `uniform` | `uniform`, `sides`, या `region` |
| margin | number | No | `20` | `uniform` मोड: हर किनारे के लिए पॉइंट में क्रॉप मार्जिन (0-2000) |
| top, right, bottom, left | number | No | `0` | `sides` मोड: प्रत्येक किनारे के लिए पॉइंट में क्रॉप मार्जिन (0-2000) |
| x, y | number | No | `0` | `region` मोड: पृष्ठ के बाएँ और ऊपरी किनारों से क्षेत्र की दूरी पॉइंट में |
| width, height | number | No | `288`, `432` | `region` मोड: क्षेत्र का आकार पॉइंट में (4x6 in का लेबल) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/crop-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"margin": 50}'
```

हर पृष्ठ के ऊपरी-बाएँ कोने में केवल 4x6 in का लेबल रखें:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/crop-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@label.pdf" \
  -F 'settings={"mode": "region", "x": 0, "y": 0, "width": 288, "height": 432}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2440000
}
```

## Notes {#notes}

- सभी मान PDF पॉइंट में हैं (1 पॉइंट = 1/72 इंच)। US Letter पृष्ठ 612 x 792 पॉइंट का होता है।
- हर मोड केवल अपने फ़ील्ड पढ़ता है, इसलिए जो अनुरोध केवल `margin` भेजता है वह पहले की तरह काम करता है।
- क्षेत्र को हर पृष्ठ के ऊपरी-बाएँ कोने से मापा जाता है और वह हर पृष्ठ के भीतर समाना चाहिए। मार्जिन को हर पृष्ठ का कुछ हिस्सा बचाकर रखना होगा। अन्यथा अनुरोध `400` के साथ विफल हो जाता है।
- जिस पृष्ठ को घुमाकर दिखाने के लिए सेट किया गया है, उसमें स्थिति और किनारे पृष्ठ को वैसा ही मानते हैं जैसा वह दिखता है, इसलिए क्षेत्र का ऊपरी-बाएँ कोना घुमाए गए पृष्ठ का ऊपरी-बाएँ कोना होता है।
- हर मोड पूरे मीडिया बॉक्स से मापता है, इसलिए पहले से क्रॉप किए गए पृष्ठ को क्रॉप करने पर पूरे पृष्ठ से दोबारा शुरुआत होती है। `0` का एक समान मार्जिन पूरा मीडिया बॉक्स दिखाता है।
