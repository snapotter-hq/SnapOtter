---
description: "Bir CSV'yi satır sayısına göre daha küçük dosyalara bölün."
i18n_source_hash: a35dce4a99a3
i18n_provenance: human
i18n_output_hash: 2302ae02f05c
---

# CSV Böl {#split-csv}

Büyük bir CSV veya TSV dosyasını satır sayısına göre daha küçük dosyalara bölün. Parçaları içeren bir ZIP arşivi döndürür.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/files/split-csv`

Bir CSV dosyası ve bir JSON `settings` alanı içeren multipart form verisi kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| rowsPerFile | tam sayı | Hayır | `1000` | Çıktı dosyası başına veri satırı sayısı (1-1.000.000) |
| keepHeader | boole | Hayır | `true` | Başlık satırını her çıktı dosyasında tekrarla |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/split-csv \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@large-dataset.csv" \
  -F 'settings={"rowsPerFile": 500, "keepHeader": true}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/large-dataset_parts.zip",
  "originalSize": 1048576,
  "processedSize": 1050000
}
```

## Notlar {#notes}

- Çıktı her zaman, sıralı olarak adlandırılmış bölünmüş CSV parçalarını içeren bir ZIP arşividir (ör. `part-1.csv`, `part-2.csv`).
- `keepHeader` `true` olduğunda, her parça özgün başlık satırını içerir; böylece her dosya bağımsız olarak kullanılabilir.
- Hem CSV hem de TSV dosyaları giriş olarak kabul edilir.
- Satır sayısı yalnızca veri satırlarını ifade eder; başlık satırı sayılmaz.
