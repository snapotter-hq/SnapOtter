---
description: "CSV और JSON के बीच, दोनों दिशाओं में कन्वर्ट करें।"
i18n_source_hash: 5b24abf5e9d2
i18n_provenance: human
i18n_output_hash: 32b309022614
---

# CSV to JSON {#csv-to-json}

CSV और JSON फ़ॉर्मेट के बीच दोनों दिशाओं में कन्वर्ट करें। ऑब्जेक्ट्स का एक JSON ऐरे पाने के लिए एक CSV या TSV फ़ाइल अपलोड करें, या CSV फ़ाइल पाने के लिए JSON (ऑब्जेक्ट्स का ऐरे, या उसे समेटे हुए एक ऑब्जेक्ट) अपलोड करें।

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
- JSON इनपुट ऑब्जेक्ट्स का ऐरे, किसी ऐसे ऐरे को रखने वाला एकल कुंजी का ऑब्जेक्ट (जैसे `{"data": [...]}`), या स्केलर मानों का सपाट ऑब्जेक्ट हो सकता है। प्रत्येक ऑब्जेक्ट एक पंक्ति बन जाता है, और प्रत्येक कुंजी एक कॉलम हेडर बन जाती है। सपाट ऑब्जेक्ट से `key,value` नाम की दो कॉलम वाली तालिका बनती है। एक से अधिक शीर्ष-स्तरीय कुंजियों वाले ऑब्जेक्ट और खाली ऐरे अस्वीकार किए जाते हैं।
- TSV (tab-separated values) फ़ाइलें CSV के साथ समर्थित हैं।
