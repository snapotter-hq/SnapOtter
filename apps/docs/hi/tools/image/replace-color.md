---
description: "किसी इमेज में एक विशिष्ट रंग को दूसरे रंग से बदलें या उसे पारदर्शी बनाएँ।"
i18n_source_hash: df55ac451ecb
i18n_provenance: human
i18n_output_hash: 3393829a128e
---

# Replace & Invert Color {#replace-invert-color}

स्रोत रंग से मेल खाने वाले पिक्सेल को लक्ष्य रंग से बदलें, या उन्हें पारदर्शी बनाएँ। रंग सीमाओं पर सहज ब्लेंडिंग के लिए कॉन्फ़िगर करने योग्य सहनशीलता के साथ RGB स्पेस में यूक्लिडियन दूरी का उपयोग करता है।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/replace-color`

एक इमेज फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| sourceColor | string | No | `"#FF0000"` | खोजने के लिए Hex रंग (प्रारूप: `#RRGGBB`) |
| targetColor | string | No | `"#00FF00"` | बदलने के लिए Hex रंग (प्रारूप: `#RRGGBB`) |
| makeTransparent | boolean | No | `false` | मेल खाने वाले पिक्सेल को लक्ष्य रंग से बदलने के बजाय पारदर्शी बनाएँ |
| tolerance | number | No | `30` | रंग मिलान सहनशीलता (0 से 255)। उच्च मान समान रंगों की व्यापक रेंज से मेल खाते हैं |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/replace-color \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"sourceColor": "#FF0000", "targetColor": "#0000FF", "tolerance": 40}'
```

एक हरे बैकग्राउंड को पारदर्शी बनाएँ:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/replace-color \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@greenscreen.png" \
  -F 'settings={"sourceColor": "#00FF00", "makeTransparent": true, "tolerance": 50}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.png",
  "originalSize": 2450000,
  "processedSize": 2100000
}
```

## Notes {#notes}

- रंग मिलान RGB स्पेस में यूक्लिडियन दूरी का उपयोग करता है, जिसे `tolerance * sqrt(3)` द्वारा स्केल किया जाता है।
- प्रतिस्थापन ब्लेंडिंग रंग दूरी के समानुपाती है: स्रोत रंग के करीब पिक्सेल अधिक लक्ष्य रंग प्राप्त करते हैं, जिससे सहज संक्रमण बनते हैं।
- जब `makeTransparent` `true` होता है, तो यदि इनपुट प्रारूप अल्फा चैनल का समर्थन नहीं करता है (उदा., JPEG) तो आउटपुट को PNG (या WebP/AVIF) पर बाध्य किया जाता है।
- 0 की सहनशीलता केवल सटीक स्रोत रंग से मेल खाती है। उच्च मान (50+) समान रंगों की व्यापक रेंज से मेल खाएँगे।
- आउटपुट प्रारूप इनपुट प्रारूप से मेल खाता है, जब तक कि पारदर्शिता की आवश्यकता न हो और इनपुट प्रारूप में अल्फा समर्थन न हो।
