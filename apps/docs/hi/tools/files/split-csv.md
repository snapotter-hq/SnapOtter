---
description: "किसी CSV को पंक्ति संख्या के आधार पर छोटी फ़ाइलों में विभाजित करें।"
i18n_source_hash: a35dce4a99a3
i18n_provenance: human
i18n_output_hash: 6137a3ba3de1
---

# Split CSV {#split-csv}

किसी बड़ी CSV या TSV फ़ाइल को पंक्ति संख्या के आधार पर छोटी फ़ाइलों में विभाजित करें। भागों वाला एक ZIP संग्रह लौटाता है।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/split-csv`

एक CSV फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| rowsPerFile | integer | No | `1000` | प्रति आउटपुट फ़ाइल डेटा पंक्तियों की संख्या (1-1,000,000) |
| keepHeader | boolean | No | `true` | प्रत्येक आउटपुट फ़ाइल में हेडर पंक्ति दोहराएँ |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/split-csv \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@large-dataset.csv" \
  -F 'settings={"rowsPerFile": 500, "keepHeader": true}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/large-dataset_parts.zip",
  "originalSize": 1048576,
  "processedSize": 1050000
}
```

## Notes {#notes}

- आउटपुट हमेशा विभाजित CSV भागों वाला एक ZIP संग्रह होता है, जिनके नाम क्रमबद्ध होते हैं (उदा. `part-1.csv`, `part-2.csv`)।
- जब `keepHeader`, `true` होता है, तो प्रत्येक भाग में मूल हेडर पंक्ति शामिल होती है ताकि प्रत्येक फ़ाइल स्वतंत्र रूप से उपयोग की जा सके।
- इनपुट के रूप में CSV और TSV दोनों फ़ाइलें स्वीकार की जाती हैं।
- पंक्ति संख्या केवल डेटा पंक्तियों को संदर्भित करती है; हेडर पंक्ति नहीं गिनी जाती।
