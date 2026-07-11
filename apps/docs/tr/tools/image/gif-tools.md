---
description: "Animasyonlu GIF'leri tek bir araçta yeniden boyutlandırın, optimize edin, hızını değiştirin, tersine çevirin, döndürün ve karelerini çıkarın."
i18n_source_hash: 5e525e80db92
i18n_provenance: human
i18n_output_hash: 6e3b278b30bf
---

# GIF Araçları {#gif-tools}

Animasyonlu GIF'leri yeniden boyutlandırın, optimize edin, hızını değiştirin, tersine çevirin, karelerini çıkarın ve döndürün. Tek bir araçta birden fazla işlem modu sunar.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/image/gif-tools`

## Parametreler {#parameters}

### Ortak Parametreler {#common-parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| mode | string | Hayır | `"resize"` | İşlem modu: `resize`, `optimize`, `speed`, `reverse`, `extract`, `rotate` |
| loop | number | Hayır | 0 | Çıktı GIF'i için döngü sayısı (0 = sonsuz, 1-100 = sonlu döngüler) |

### Yeniden Boyutlandırma Modu Parametreleri {#resize-mode-parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| width | integer | Hayır | - | Piksel cinsinden hedef genişlik (1 ile 16384 arası) |
| height | integer | Hayır | - | Piksel cinsinden hedef yükseklik (1 ile 16384 arası) |
| percentage | number | Hayır | - | Yüzdeye göre ölçeklendirme (1 ile 500 arası). Ayarlanırsa width/height değerlerini geçersiz kılar. |

### Optimizasyon Modu Parametreleri {#optimize-mode-parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| colors | number | Hayır | 256 | Palette bulunan maksimum renk sayısı (2 ile 256 arası) |
| dither | number | Hayır | 1.0 | Titreme (dithering) gücü (0 ile 1 arası; 0 titremeyi devre dışı bırakır) |
| effort | number | Hayır | 7 | Optimizasyon çaba düzeyi (1 ile 10 arası; daha yüksek = daha yavaş ama daha küçük) |

### Hız Modu Parametreleri {#speed-mode-parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| speedFactor | number | Hayır | 1.0 | Hız çarpanı (0.1 ile 10 arası). 1'den büyük değerler hızlandırır, 1'den küçük değerler yavaşlatır. |

### Çıkarma Modu Parametreleri {#extract-mode-parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| extractMode | string | Hayır | `"single"` | Çıkarma modu: `single`, `range`, `all` |
| frameNumber | number | Hayır | 0 | `single` modunda çıkarılacak kare dizini (0 tabanlı) |
| frameStart | number | Hayır | 0 | `range` modu için başlangıç kare dizini (0 tabanlı) |
| frameEnd | number | Hayır | - | `range` modu için bitiş kare dizini (0 tabanlı, dahil) |
| extractFormat | string | Hayır | `"png"` | Çıkarılan kareler için biçim: `png`, `webp` |

### Döndürme Modu Parametreleri {#rotate-mode-parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| angle | number | Hayır | - | Döndürme açısı: `90`, `180` veya `270` derece |
| flipH | boolean | Hayır | `false` | Yatay olarak çevir |
| flipV | boolean | Hayır | `false` | Dikey olarak çevir |

## Örnek İstekler {#example-requests}

### Yeniden Boyutlandırma {#resize}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@animation.gif" \
  -F 'settings={"mode":"resize","percentage":50}'
```

### Optimizasyon {#optimize}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@large.gif" \
  -F 'settings={"mode":"optimize","colors":128,"effort":9}'
```

### Hızlandırma {#speed-up}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@animation.gif" \
  -F 'settings={"mode":"speed","speedFactor":2.0}'
```

### Tek Kare Çıkarma {#extract-single-frame}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@animation.gif" \
  -F 'settings={"mode":"extract","extractMode":"single","frameNumber":5,"extractFormat":"png"}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/animation.gif",
  "originalSize": 2345678,
  "processedSize": 1234567
}
```

## Bilgi Alt Rotası {#info-sub-route}

`POST /api/v1/tools/image/gif-tools/info`

Bir animasyonlu GIF'i işlemeden onun hakkında meta veri döndürür.

### Bilgi İsteği {#info-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools/info \
  -F "file=@animation.gif"
```

### Bilgi Yanıtı {#info-response}

```json
{
  "width": 480,
  "height": 320,
  "pages": 24,
  "delay": [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
  "loop": 0,
  "fileSize": 2345678,
  "duration": 2400
}
```

## Notlar {#notes}

- Ana işleme uç noktası için standart `createToolRoute` fabrikasını kullanır.
- Bilgi uç noktası yalnızca bir dosya yüklemesi gerektirir (ayara gerek yoktur).
- `resize` modunda, `percentage` sağlanırsa `width`/`height` üzerinde önceliğe sahip olur. Yeniden boyutlandırma, en boy oranını korumak için `fit: inside` kullanır.
- `speed` modunda, kare gecikmeleri hız faktörüne bölünür. Kare başına minimum gecikme 20ms'dir (GIF spesifikasyon sınırlaması).
- `reverse` modunda, tersine çevirirken hızı aynı anda ayarlamak için `speedFactor` parametresi de kullanılabilir.
- `range` veya `all` ile `extract` modunda çıktı, tekil kareleri içeren bir ZIP dosyasıdır.
- `rotate` modunda, her kare ayrı ayrı işlenir ve bir animasyona yeniden birleştirilir.
- `loop` parametresi, çıktı GIF'inin kaç kez döngü yapacağını kontrol eder. Sonsuz döngü için 0 kullanın.
- Bilgi yanıtındaki `duration` alanı, milisaniye cinsinden toplam animasyon süresidir.
