---
description: "स्प्रेडशीट को PDF में कन्वर्ट करें।"
i18n_source_hash: 4dbe2a810ea6
i18n_provenance: human
i18n_output_hash: e1b4a9323bc9
---

# Excel to PDF {#excel-to-pdf}

Excel, OpenDocument, या CSV स्प्रेडशीट को PDF में कन्वर्ट करें। चौड़ी शीट कई पेजों में पृष्ठांकित हो सकती हैं।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/excel-to-pdf`

एक Excel/ODS/CSV फ़ाइल के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

इस टूल में कोई कॉन्फ़िगर करने योग्य पैरामीटर नहीं है। एक स्प्रेडशीट अपलोड करें और यह PDF में कन्वर्ट हो जाएगी।

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/excel-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@budget.xlsx"
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
- परिणामी PDF में चौड़ी शीट कई पेजों में विभाजित हो सकती हैं।
- चार्ट और conditional formatting PDF आउटपुट में रेंडर किए जाते हैं।
- कन्वर्ज़न सर्वर पर headless चल रहे LibreOffice द्वारा नियंत्रित किया जाता है।
