---
description: "पैटर्न टेम्प्लेट का उपयोग करके कई फ़ाइलों का नाम बदलें और ZIP के रूप में डाउनलोड करें।"
i18n_source_hash: 2776dcc2f71c
i18n_provenance: human
i18n_output_hash: f629ea082a40
---

# Bulk Rename {#bulk-rename}

इंडेक्स, पैडेड इंडेक्स, और मूल फ़ाइल नाम के लिए प्लेसहोल्डर वाले पैटर्न टेम्प्लेट का उपयोग करके कई फ़ाइलों का नाम बदलें। सभी नाम-बदली गई फ़ाइलों वाला एक ZIP संग्रह लौटाता है।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/bulk-rename`

कई फ़ाइलों और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| pattern | string | No | `"image-{{index}}"` | प्लेसहोल्डर के साथ नामकरण पैटर्न (अधिकतम 1000 वर्ण) |
| startIndex | number | No | `1` | प्रारंभिक इंडेक्स संख्या |

### Pattern Placeholders {#pattern-placeholders}

| Placeholder | Description | Example |
|-------------|-------------|---------|
| `{{index}}` | `startIndex` से शुरू होने वाली क्रमिक संख्या | `1`, `2`, `3` |
| `{{padded}}` | शून्य-पैडेड क्रमिक संख्या | `01`, `02`, `03` |
| `{{original}}` | एक्सटेंशन के बिना मूल फ़ाइल नाम | `photo`, `IMG_001` |

मूल फ़ाइल एक्सटेंशन हमेशा संरक्षित रहता है।

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/bulk-rename \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F "file=@photo3.jpg" \
  -F 'settings={"pattern": "vacation-{{padded}}", "startIndex": 1}'
```

यह उत्पन्न करता है: `vacation-1.jpg`, `vacation-2.jpg`, `vacation-3.jpg`

मूल फ़ाइल नाम का उपयोग करते हुए:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/bulk-rename \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@IMG_001.jpg" \
  -F "file=@IMG_002.jpg" \
  -F 'settings={"pattern": "2024-trip-{{original}}-{{index}}"}'
```

यह उत्पन्न करता है: `2024-trip-IMG_001-1.jpg`, `2024-trip-IMG_002-2.jpg`

## Example Response {#example-response}

प्रतिक्रिया एक ZIP फ़ाइल है जो सीधे स्ट्रीम की जाती है (JSON प्रतिक्रिया नहीं)। प्रतिक्रिया हेडर हैं:

```
Content-Type: application/zip
Content-Disposition: attachment; filename="renamed-a1b2c3d4.zip"
```

## Notes {#notes}

- यह टूल छवियों को प्रोसेस नहीं करता। यह केवल फ़ाइलों का नाम बदलता है और उन्हें एक ZIP संग्रह में पैकेज करता है।
- `{{padded}}` के लिए शून्य-पैडिंग चौड़ाई फ़ाइलों की कुल संख्या के आधार पर स्वचालित रूप से निर्धारित होती है (उदा. 100 फ़ाइलें 3-अंकीय पैडिंग का उपयोग करेंगी: `001`, `002`, आदि)।
- फ़ाइल एक्सटेंशन मूल फ़ाइल नामों से संरक्षित रहते हैं।
- असुरक्षित वर्णों को हटाने के लिए फ़ाइल नामों को स्वच्छ किया जाता है।
- कम से कम एक फ़ाइल प्रदान की जानी चाहिए।
