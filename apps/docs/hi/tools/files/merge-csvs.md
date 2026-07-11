---
description: "मिलते-जुलते कॉलम वाली कई CSV या TSV फ़ाइलों को एक में जोड़ें।"
i18n_source_hash: 109b5f399ac8
i18n_provenance: human
i18n_output_hash: 72da86b9d112
---

# Merge CSVs {#merge-csvs}

मिलते-जुलते कॉलम वाली कई CSV या TSV फ़ाइलों को एक ही मर्ज की गई फ़ाइल में जोड़ें। सभी इनपुट फ़ाइलों के कॉलम हेडर एक जैसे होने चाहिए।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/merge-csvs`

दो या अधिक CSV फ़ाइलों के साथ multipart form data स्वीकार करता है। किसी settings फ़ील्ड की आवश्यकता नहीं है।

## Parameters {#parameters}

इस टूल में कोई कॉन्फ़िगर करने योग्य पैरामीटर नहीं है। मिलते-जुलते कॉलम हेडर वाली 2-20 CSV या TSV फ़ाइलें अपलोड करें।

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/merge-csvs \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@january.csv" \
  -F "file=@february.csv" \
  -F "file=@march.csv"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.csv",
  "originalSize": 30000,
  "processedSize": 28500
}
```

## Notes {#notes}

- 2 से 20 के बीच इनपुट फ़ाइलों की आवश्यकता होती है।
- सभी फ़ाइलों के कॉलम हेडर एक जैसे होने चाहिए। यदि कॉलम मेल नहीं खाते तो मर्ज विफल हो जाएगा।
- आउटपुट में हेडर पंक्ति एक बार शामिल होती है; सभी फ़ाइलों की डेटा पंक्तियाँ अपलोड क्रम में जोड़ी जाती हैं।
- CSV और TSV दोनों फ़ाइलें स्वीकार की जाती हैं, लेकिन एक ही अनुरोध की सभी फ़ाइलों को एक ही delimiter का उपयोग करना चाहिए।
