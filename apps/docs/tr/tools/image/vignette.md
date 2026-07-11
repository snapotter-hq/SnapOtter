---
description: "Ayarlanabilir güç, renk ve konumla bir vinyet efekti ekleyin."
i18n_source_hash: 0b9795fea2eb
i18n_provenance: human
i18n_output_hash: c07ff3aaa177
---

# Vinyet {#vignette}

Bir görüntünün kenarlarını karartan veya renklendiren bir vinyet efekti ekleyin. Ayarlanabilir güç, renk, yarıçap, yumuşaklık, yuvarlaklık ve merkez konumunu destekler.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/image/vignette`

Bir görüntü dosyası ve bir JSON `settings` alanı içeren multipart form verisini kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| strength | number | Hayır | `0.5` | Vinyet opaklığı (0.1-1) |
| color | string | Hayır | `"#000000"` | Vinyet hex rengi |
| radius | integer | Hayır | `70` | Yarı çaprazın yüzdesi olarak dış yarıçap (0-100) |
| softness | integer | Hayır | `50` | Tüy yumuşaklığı (0-100); daha yüksek değerler daha kademeli bir solma üretir |
| roundness | integer | Hayır | `100` | Şekil: 100 = daire, 0 = görüntü en-boy oranına uyan elips |
| centerX | integer | Hayır | `50` | Yüzde olarak yatay merkez konumu (0-100) |
| centerY | integer | Hayır | `50` | Yüzde olarak dikey merkez konumu (0-100) |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/vignette \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"strength": 0.7, "radius": 60, "softness": 70}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2410000
}
```

## Notlar {#notes}

- Daha küçük bir `radius` görüntünün daha fazlasını karartır; daha büyük bir yarıçap vinyeti en uç kenarlarla sınırlar.
- Yaratıcı vinyet efektleri için siyah olmayan bir `color` kullanın (örn. beyaz veya sepya tonları).
- `centerX` ve `centerY` değerlerini ayarlamak, net alanı merkez dışına konumlandırmanızı sağlar; bu, çerçevenin ortasında olmayan bir özneye odağı çekmek için kullanışlıdır.
- Çıktı biçimi giriş biçimiyle eşleşir. HEIC, RAW, PSD ve SVG girdileri işlenmeden önce otomatik olarak çözülür.
