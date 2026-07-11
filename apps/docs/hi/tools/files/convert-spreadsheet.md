---
description: "Excel, OpenDocument, और CSV फ़ॉर्मेट के बीच कन्वर्ट करें।"
i18n_source_hash: b813b1b06962
i18n_provenance: human
i18n_output_hash: 10d32a7068f3
---

# Convert Spreadsheet {#convert-spreadsheet}

स्प्रेडशीट को Excel (XLSX), OpenDocument Spreadsheet (ODS), और CSV फ़ॉर्मेट के बीच कन्वर्ट करें। CSV में कन्वर्ट करते समय multi-sheet वर्कबुक पहली शीट को निर्यात करती हैं।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/convert-spreadsheet`

एक Excel/ODS/CSV फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | Yes | - | आउटपुट फ़ॉर्मेट: `xlsx`, `ods`, `csv` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-spreadsheet \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@data.xlsx" \
  -F 'settings={"format": "csv"}'
```

## Example Response {#example-response}

`202 Accepted` लौटाता है। `/api/v1/jobs/{jobId}/progress` पर SSE के माध्यम से प्रगति को ट्रैक करें।

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- स्वीकृत इनपुट फ़ॉर्मेट: `.xlsx`, `.xls`, `.ods`, `.csv`।
- multi-sheet वर्कबुक को CSV में कन्वर्ट करते समय, केवल पहली शीट निर्यात की जाती है।
- CSV आउटपुट में फ़ॉर्मूले मूल्यांकित किए जाते हैं और स्थिर मानों के रूप में निर्यात किए जाते हैं।
- आउटपुट फ़ॉर्मेट इनपुट फ़ॉर्मेट से भिन्न होना चाहिए।
