---
description: "प्रति शीट कई PDF पृष्ठ व्यवस्थित करें (2-up, 4-up, आदि)।"
i18n_source_hash: 9dd82737cb72
i18n_provenance: human
i18n_output_hash: 733e3a2ddc60
---

# N-up PDF {#n-up-pdf}

प्रिंट करते समय कागज़ बचाने के लिए प्रति शीट कई पृष्ठ व्यवस्थित करें, जैसे 2-up या 4-up लेआउट।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/nup-pdf`

एक PDF फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| perSheet | integer | No | `2` | प्रति शीट पृष्ठ: `2`, `3`, `4`, `8`, `9`, `12`, या `16` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/nup-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"perSheet": 4}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2300000
}
```

## Notes {#notes}

- पृष्ठ पढ़ने के क्रम में व्यवस्थित किए जाते हैं (बाएं से दाएं, ऊपर से नीचे)।
- आउटपुट पृष्ठ आकार मूल से मेल खाता है; अलग-अलग पृष्ठों को ग्रिड में फिट करने के लिए छोटा किया जाता है।
- `perSheet: 4` के साथ एक 20-पृष्ठ का दस्तावेज़ 5-पृष्ठ का आउटपुट बनाता है।
