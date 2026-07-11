---
description: "CSV और Excel (XLSX) के बीच, दोनों दिशाओं में कन्वर्ट करें।"
i18n_source_hash: 213297311e36
i18n_provenance: human
i18n_output_hash: 220974f8ec8d
---

# CSV to Excel {#csv-to-excel}

CSV और Excel (XLSX) फ़ॉर्मेट के बीच दोनों दिशाओं में कन्वर्ट करें। XLSX पाने के लिए एक CSV या TSV फ़ाइल अपलोड करें, या CSV पाने के लिए एक XLSX फ़ाइल अपलोड करें।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/csv-excel`

एक CSV, TSV, या XLSX फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| sheet | integer | No | `1` | XLSX से कन्वर्ट करते समय निर्यात करने के लिए वर्कशीट संख्या (न्यूनतम 1) |

## Example Request {#example-request}

CSV to Excel:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-excel \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@data.csv" \
  -F 'settings={"sheet": 1}'
```

Excel to CSV:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-excel \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.xlsx" \
  -F 'settings={"sheet": 2}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/data.xlsx",
  "originalSize": 2048,
  "processedSize": 5120
}
```

## Notes {#notes}

- कन्वर्ज़न दिशा इनपुट फ़ाइल एक्सटेंशन से स्वतः पहचानी जाती है: `.csv` या `.tsv` `.xlsx` उत्पन्न करता है, और `.xlsx` `.csv` उत्पन्न करता है।
- `sheet` पैरामीटर केवल XLSX से कन्वर्ट करते समय लागू होता है। यह चुनता है कि किस वर्कशीट को निर्यात करना है।
- TSV (tab-separated values) फ़ाइलें CSV के साथ समर्थित हैं।
