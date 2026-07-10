---
description: "YAML ve JSON arasında her iki yönde dönüştürün."
i18n_source_hash: acf8ca21ee99
i18n_provenance: human
i18n_output_hash: a0463e61bb6c
---

# YAML / JSON {#yaml-json}

YAML ve JSON biçimleri arasında her iki yönde dönüştürün. JSON almak için bir YAML dosyası, YAML almak için bir JSON dosyası yükleyin.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/files/yaml-json`

Bir YAML veya JSON dosyası içeren multipart form verisi kabul eder. Ayarlar alanı gerekli değildir.

## Parametreler {#parameters}

Bu aracın yapılandırılabilir parametresi yoktur. Dönüştürme yönü, giriş dosyasının uzantısıyla belirlenir.

## Örnek İstek {#example-request}

YAML'dan JSON'a:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/yaml-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.yaml"
```

JSON'dan YAML'a:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/yaml-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.json"
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/config.json",
  "originalSize": 620,
  "processedSize": 780
}
```

## Notlar {#notes}

- Dönüştürme yönü giriş dosyasının uzantısından otomatik olarak algılanır: `.yaml` veya `.yml` `.json` üretir, `.json` ise `.yaml` üretir.
- Hem `.yaml` hem de `.yml` uzantıları kabul edilir.
- Çok belgeli bir YAML dosyasında yalnızca ilk belge dönüştürülür; `---` ile ayrılan ek belgeler yok sayılır.
