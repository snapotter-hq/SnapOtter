---
description: "किसी छवि से प्रति-चैनल आँकड़ों के साथ एक RGB histogram चार्ट जनरेट करें।"
i18n_source_hash: 57aa610206a5
i18n_provenance: human
i18n_output_hash: adc060a069a5
---

# Histogram {#histogram}

किसी छवि से एक RGB histogram चार्ट जनरेट करें। प्रतिक्रिया JSON में प्रति-चैनल आँकड़ों और कच्चे 256-bin histogram डेटा के साथ एक PNG histogram छवि लौटाता है।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/histogram`

एक image फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| scale | string | नहीं | `"linear"` | Y-axis स्केल: `linear` या `log` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/histogram \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"scale": "linear"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/histogram.png",
  "originalSize": 2450000,
  "processedSize": 12000,
  "bins": {
    "r": [0, 12, 45, "... (256 values)"],
    "g": [0, 8, 38, "... (256 values)"],
    "b": [2, 15, 52, "... (256 values)"],
    "lum": [0, 10, 40, "... (256 values)"]
  },
  "stats": {
    "r": { "mean": 128, "median": 132, "stdev": 48.5 },
    "g": { "mean": 119, "median": 121, "stdev": 44.2 },
    "b": { "mean": 105, "median": 108, "stdev": 51.3 },
    "lum": { "mean": 118, "median": 120, "stdev": 45.1 }
  },
  "mean": { "r": 128, "g": 119, "b": 105 },
  "max": { "r": 4200, "g": 3800, "b": 4100 }
}
```

## Notes {#notes}

- `downloadUrl` एक रेंडर किए गए PNG histogram चार्ट की ओर इंगित करता है जो R, G, B और luminance वितरण दिखाता है।
- `bins` में प्रत्येक चैनल (red, green, blue, luminance) के लिए कच्चे 256-मान arrays होते हैं, जो कस्टम विज़ुअलाइज़ेशन रेंडर करने के लिए उपयुक्त हैं।
- `stats` प्रति चैनल mean, median और मानक विचलन प्रदान करता है।
- `mean` और `max` पश्च-संगत शॉर्टहैंड फ़ील्ड हैं।
- जब histogram पर कुछ शिखर हावी हों और आप निचले bins में विवरण देखना चाहें तो `log` स्केल का उपयोग करें।
- HEIC, RAW, PSD और SVG इनपुट विश्लेषण से पहले स्वचालित रूप से डिकोड किए जाते हैं।
