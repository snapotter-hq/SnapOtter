---
description: "Eşleşen sütunlara sahip birden fazla CSV veya TSV dosyasını tek bir dosyada birleştirin."
i18n_source_hash: 109b5f399ac8
i18n_provenance: human
i18n_output_hash: a1d5d13d8b3e
---

# CSV'leri Birleştir {#merge-csvs}

Eşleşen sütunlara sahip birden fazla CSV veya TSV dosyasını tek bir birleştirilmiş dosyada bir araya getirin. Tüm giriş dosyaları aynı sütun başlıklarına sahip olmalıdır.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/files/merge-csvs`

İki veya daha fazla CSV dosyası içeren multipart form verisi kabul eder. Ayarlar alanı gerekli değildir.

## Parametreler {#parameters}

Bu aracın yapılandırılabilir parametresi yoktur. Eşleşen sütun başlıklarına sahip 2-20 CSV veya TSV dosyası yükleyin.

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/merge-csvs \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@january.csv" \
  -F "file=@february.csv" \
  -F "file=@march.csv"
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.csv",
  "originalSize": 30000,
  "processedSize": 28500
}
```

## Notlar {#notes}

- 2 ile 20 arasında giriş dosyası gerektirir.
- Tüm dosyalar aynı sütun başlıklarını paylaşmalıdır. Sütunlar eşleşmezse birleştirme başarısız olur.
- Başlık satırı çıktıya bir kez dahil edilir; tüm dosyalardaki veri satırları yükleme sırasına göre art arda eklenir.
- Hem CSV hem de TSV dosyaları kabul edilir, ancak tek bir istekteki tüm dosyalar aynı ayırıcıyı kullanmalıdır.
