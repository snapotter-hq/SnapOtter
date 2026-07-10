---
description: "JSON ve XML arasında her iki yönde dönüştürün."
i18n_source_hash: b3a6ded0c64a
i18n_provenance: human
i18n_output_hash: e1f89976f36d
---

# JSON to XML {#json-to-xml}

JSON ve XML formatları arasında her iki yönde dönüştürün. XML almak için bir JSON dosyası yükleyin veya JSON almak için bir XML dosyası yükleyin.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/json-xml`

Bir JSON veya XML dosyası ve JSON `settings` alanı içeren multipart form verisi kabul eder.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| pretty | boolean | No | `true` | Çıktıyı girintileme ile düzenli yazdır |

## Example Request {#example-request}

JSON'dan XML'e:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/json-xml \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.json" \
  -F 'settings={"pretty": true}'
```

XML'den JSON'a:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/json-xml \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.xml" \
  -F 'settings={"pretty": true}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/config.xml",
  "originalSize": 850,
  "processedSize": 1200
}
```

## Notes {#notes}

- Dönüştürme yönü giriş dosyası uzantısından otomatik olarak algılanır: `.json` `.xml` üretir ve `.xml` `.json` üretir.
- `pretty` parametresi her iki yöne de uygulanır. `false` olduğunda, çıktı girintileme olmadan kompakt olur.
- XML öznitelikleri ve iç içe yapılar, mümkün olduğunda gidiş-dönüş dönüştürme sırasında korunur.
