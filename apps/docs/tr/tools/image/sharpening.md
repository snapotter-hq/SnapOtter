---
description: "İsteğe bağlı gürültü azaltma ile uyarlanabilir, unsharp mask veya high-pass yöntemlerini kullanarak görüntüleri keskinleştirin."
i18n_source_hash: ccb60af9faae
i18n_provenance: human
i18n_output_hash: 9951348a9731
---

# Keskinleştirme {#sharpening}

Üç yöntemli gelişmiş keskinleştirme aracı: uyarlanabilir (akıllı kenar farkındalıklı), unsharp mask (klasik yarıçap/miktar) ve high-pass (doku vurgusu). Keskinleştirme artefaktlarını önlemek için yerleşik gürültü azaltma içerir.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/image/sharpening`

Bir görüntü dosyası ve bir JSON `settings` alanı içeren multipart form verisini kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| method | string | Hayır | `"adaptive"` | Keskinleştirme algoritması: `adaptive`, `unsharp-mask`, `high-pass` |
| sigma | number | Hayır | `1.0` | Uyarlanabilir: Gauss sigma (0.5 ile 10 arası) |
| m1 | number | Hayır | `1.0` | Uyarlanabilir: düz alan keskinleştirme (0 ile 10 arası) |
| m2 | number | Hayır | `3.0` | Uyarlanabilir: pürüzlü alan keskinleştirme (0 ile 20 arası) |
| x1 | number | Hayır | `2.0` | Uyarlanabilir: düz/pürüzlü eşiği (0 ile 10 arası) |
| y2 | number | Hayır | `12` | Uyarlanabilir: maksimum düz keskinleştirme (0 ile 50 arası) |
| y3 | number | Hayır | `20` | Uyarlanabilir: maksimum pürüzlü keskinleştirme (0 ile 50 arası) |
| amount | number | Hayır | `100` | Unsharp mask: keskinleştirme miktarı (0 ile 1000 arası) |
| radius | number | Hayır | `1.0` | Unsharp mask: piksel cinsinden bulanıklık yarıçapı (0.1 ile 5 arası) |
| threshold | number | Hayır | `0` | Unsharp mask: keskinleştirmek için minimum parlaklık farkı (0 ile 255 arası) |
| strength | number | Hayır | `50` | High-pass: filtre gücü (0 ile 100 arası) |
| kernelSize | number | Hayır | `3` | High-pass: konvolüsyon çekirdek boyutu (3 veya 5) |
| denoise | string | Hayır | `"off"` | Keskinleştirme öncesi gürültü azaltma: `off`, `light`, `medium`, `strong` |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/sharpening \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"method": "adaptive", "sigma": 1.5}'
```

Düz alanları korumak için eşikli unsharp mask:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/sharpening \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"method": "unsharp-mask", "amount": 150, "radius": 1.5, "threshold": 10}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2510000
}
```

## Notlar {#notes}

- Yalnızca seçilen yöntemle ilgili parametreler kullanılır. Örneğin, `method` değeri `adaptive` olduğunda `amount`, `radius` ve `threshold` yok sayılır.
- Uyarlanabilir yöntem, yapılandırılabilir düz/pürüzlü bölge davranışıyla Sharp'ın yerleşik uyarlanabilir keskinleştirmesini kullanır.
- `denoise` seçeneği, gürültü/tanenin yükseltilmesini önlemek için keskinleştirme öncesinde gürültü azaltma uygular.
- High-pass keskinleştirme, orijinalden bulanıklaştırılmış bir sürümü çıkararak ince ayrıntıyı ayıklar, ardından geri harmanlar.
- Çıktı biçimi giriş biçimiyle eşleşir. HEIC, RAW, PSD ve SVG girdileri işlenmeden önce otomatik olarak çözülür.
