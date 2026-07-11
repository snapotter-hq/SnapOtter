---
description: "Çubukları videonun bulanık bir kopyasıyla doldurun."
i18n_source_hash: 0c72aaefc6de
i18n_provenance: human
i18n_output_hash: 9f0db7aa1246
---

# Bulanık Dolgu {#blur-pad}

Dolgu alanını düz renkli çubuklar yerine videonun bulanık, ölçeklenmiş bir kopyasıyla doldurarak bir videoyu hedef bir en boy oranına sığdırın.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/video/blur-pad`

Bir video dosyası ve bir JSON `settings` alanı içeren multipart form verisini kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| target | string | Hayır | `"16:9"` | Hedef en boy oranı: `16:9`, `9:16`, `1:1`, `4:3`, `3:4` |
| blur | number | Hayır | `20` | Arka plan için Gauss bulanıklık sigması (2-50) |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/blur-pad \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"target": "16:9", "blur": 30}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 14100000
}
```

## Notlar {#notes}

- Daha yüksek bulanıklık değerleri daha yumuşak, daha soyut bir arka plan üretir. Daha düşük değerler daha fazla ayrıntıyı görünür tutar.
- Video zaten hedef en boy oranıyla eşleşiyorsa, dosya değiştirilmeden döndürülür.
- Düz renkli dolgu için bunun yerine En Boy Dolgusu aracını kullanın.
