---
description: "CSV और JSON के बीच, दोनों दिशाओं में कन्वर्ट करें।"
i18n_source_hash: 978c08ad46d3
i18n_provenance: human
i18n_output_hash: 217f60288656
---

# CSV to JSON {#csv-to-json}

CSV और JSON फ़ॉर्मेट के बीच दोनों दिशाओं में कन्वर्ट करें। ऑब्जेक्ट्स का एक JSON ऐरे पाने के लिए एक CSV या TSV फ़ाइल अपलोड करें, या CSV फ़ाइल पाने के लिए एक JSON ऐरे अपलोड करें।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/csv-json`

एक CSV, TSV, या JSON फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| pretty | boolean | No | `true` | इंडेंटेशन के साथ JSON आउटपुट को Pretty-print करें |

## Example Request {#example-request}

CSV to JSON:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@users.csv" \
  -F 'settings={"pretty": true}'
```

JSON to CSV:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@users.json" \
  -F 'settings={}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/users.json",
  "originalSize": 1500,
  "processedSize": 2200
}
```

## Notes {#notes}

- कन्वर्ज़न दिशा इनपुट फ़ाइल एक्सटेंशन से स्वतः पहचानी जाती है: `.csv` या `.tsv` `.json` उत्पन्न करता है, और `.json` `.csv` उत्पन्न करता है।
- `pretty` पैरामीटर केवल JSON आउटपुट को प्रभावित करता है। जब `false` पर सेट किया जाता है, तो आउटपुट एक कॉम्पैक्ट सिंगल-लाइन JSON स्ट्रिंग होता है।
- JSON इनपुट सुसंगत कुंजियों वाले ऑब्जेक्ट्स का एक ऐरे होना चाहिए। प्रत्येक ऑब्जेक्ट एक पंक्ति बन जाता है, और प्रत्येक कुंजी एक कॉलम हेडर बन जाती है।
- TSV (tab-separated values) फ़ाइलें CSV के साथ समर्थित हैं।
