---
description: "Word, OpenDocument, RTF, और plain text फ़ॉर्मेट के बीच कन्वर्ट करें।"
i18n_source_hash: 89771292569d
i18n_provenance: human
i18n_output_hash: 2126b681cdd1
---

# Convert Document {#convert-document}

LibreOffice का उपयोग करके दस्तावेज़ों को Word (DOCX), OpenDocument (ODT), RTF, और plain text फ़ॉर्मेट के बीच कन्वर्ट करें।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/convert-document`

एक Word/ODT/RTF/TXT फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | Yes | - | आउटपुट फ़ॉर्मेट: `docx`, `odt`, `rtf`, `txt` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-document \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.docx" \
  -F 'settings={"format": "odt"}'
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

- स्वीकृत इनपुट फ़ॉर्मेट: `.docx`, `.doc`, `.odt`, `.rtf`, `.txt`।
- कन्वर्ज़न सर्वर पर headless चल रहे LibreOffice द्वारा नियंत्रित किया जाता है।
- जटिल फ़ॉर्मेटिंग (macros, embedded objects) फ़ॉर्मेट के बीच कन्वर्ज़न में बची न रह सकती है।
- आउटपुट फ़ॉर्मेट इनपुट फ़ॉर्मेट से भिन्न होना चाहिए।
