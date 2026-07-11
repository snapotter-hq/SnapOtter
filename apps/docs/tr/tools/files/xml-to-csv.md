---
description: "XML'den yinelenen ögeleri bir CSV tablosuna çıkarın."
i18n_source_hash: 3ab1019bff8a
i18n_provenance: human
i18n_output_hash: 7306e8f23bda
---

# XML'den CSV'ye {#xml-to-csv}

Bir XML dosyasındaki yinelenen ögeleri düz bir CSV tablosuna çıkarın. Araç, XML ağacındaki ilk nesne dizisini otomatik olarak bulur ve her ögeyi bir satıra eşler.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/files/xml-to-csv`

Bir XML dosyası içeren multipart form verisi kabul eder. Ayarlar alanı gerekli değildir.

## Parametreler {#parameters}

Bu aracın yapılandırılabilir parametresi yoktur. Yinelenen öge, XML yapısından otomatik olarak algılanır.

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/xml-to-csv \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@catalog.xml"
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/catalog.csv",
  "originalSize": 4500,
  "processedSize": 1800
}
```

## Notlar {#notes}

- Yalnızca `.xml` dosyaları giriş olarak kabul edilir.
- Araç, XML ağacını ilk yinelenen kardeş öge kümesi için tarar ve bunları satır olarak kullanır.
- Her benzersiz alt öge veya öznitelik adı bir CSV sütun başlığı olur.
- Bu tek yönlü bir dönüştürmedir. Çift yönlü JSON/XML dönüştürmesi için [JSON'dan XML'e](/tr/tools/files/json-xml) aracını kullanın.
