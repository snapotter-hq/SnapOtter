---
description: "Görüntü dosyası boyutunu kalite düzeyine göre veya hedef dosya boyutuna göre azaltın."
i18n_source_hash: 342c5cf1f864
i18n_provenance: human
i18n_output_hash: abf4d9eb2451
---

# Görüntü Sıkıştır {#compress}

Bir kalite düzeyi veya kilobayt cinsinden hedef bir dosya boyutu belirterek görüntü dosyası boyutunu azaltın. Araç, boyut hedeflerine doğru bir şekilde ulaşmak için yinelemeli ikili arama kullanır.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/image/compress`

Bir görüntü dosyası ve bir JSON `settings` alanı ile çok parçalı form verilerini kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| mode | string | Hayır | `"quality"` | Sıkıştırma modu: `quality` veya `targetSize` |
| quality | number | Hayır | `80` | Kalite düzeyi (1-100). Mod `quality` olduğunda kullanılır. |
| targetSizeKb | number | Hayır | - | Kilobayt cinsinden hedef dosya boyutu. Mod `targetSize` olduğunda kullanılır. |

## Örnek İstek {#example-request}

Kalite 60'a sıkıştır:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"mode": "quality", "quality": 60}'
```

200 KB hedef boyutuna sıkıştır:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"mode": "targetSize", "targetSizeKb": 200}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 204800
}
```

## Notlar {#notes}

- `quality` modunda, daha düşük değerler daha fazla sıkıştırma bozulmasıyla daha küçük dosyalar üretir. 80 değeri, web kullanımı için iyi bir varsayılandır.
- `targetSize` modunda, motor hedefi aşmadan mümkün olduğunca yaklaşmak için yinelemeli sıkıştırma gerçekleştirir.
- Çıktı biçimi giriş biçimiyle eşleşir. Sıkıştırma, biçimin yerel kodlamasına uygulanır (örn. JPEG dosyaları için JPEG kalitesi, WebP dosyaları için WebP kalitesi).
- Varsayılan kalite (80) kabul edilebilirse, `quality` parametresini tamamen atlayabilirsiniz.
