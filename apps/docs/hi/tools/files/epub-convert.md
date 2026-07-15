---
description: "एक EPUB को PDF, DOCX, HTML, या Markdown में कन्वर्ट करें।"
i18n_source_hash: cb39f254ff2f
i18n_provenance: human
i18n_output_hash: 24e1c91bfb3b
---

# EPUB से कन्वर्ट {#convert-epub}

एक EPUB e-book को PDF, Word (DOCX), HTML, या Markdown में कन्वर्ट करें। पुस्तक के अंदर के रिमोट संसाधन नहीं लाए जाते।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/epub-convert`

एक EPUB फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | Yes | - | आउटपुट फ़ॉर्मेट: `pdf`, `docx`, `html`, `md` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/epub-convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@book.epub" \
  -F 'settings={"format": "pdf"}'
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

- स्वीकृत इनपुट फ़ॉर्मेट: `.epub`।
- सुरक्षा के लिए EPUB में एम्बेड किए गए रिमोट संसाधन (बाहरी इमेज, फ़ॉन्ट) नहीं लाए जाते।
- कन्वर्ट किए गए आउटपुट में इमेज की विश्वसनीयता EPUB संरचना के आधार पर भिन्न हो सकती है।
- कन्वर्ज़न सर्वर पर Pandoc द्वारा नियंत्रित किया जाता है।
