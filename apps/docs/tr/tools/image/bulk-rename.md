---
description: "Bir kalıp şablonu kullanarak birden fazla dosyayı yeniden adlandırın ve ZIP olarak indirin."
i18n_source_hash: 2776dcc2f71c
i18n_provenance: human
i18n_output_hash: 7f08948bcee7
---

# Toplu Yeniden Adlandırma {#bulk-rename}

Dizin, dolgulu dizin ve özgün dosya adı için yer tutucular içeren bir kalıp şablonu kullanarak birden fazla dosyayı yeniden adlandırın. Yeniden adlandırılan tüm dosyaları içeren bir ZIP arşivi döndürür.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/image/bulk-rename`

Birden fazla dosya ve bir JSON `settings` alanı içeren multipart form verisi kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| pattern | dize | Hayır | `"image-{{index}}"` | Yer tutuculu adlandırma kalıbı (en fazla 1000 karakter) |
| startIndex | sayı | Hayır | `1` | Başlangıç dizin numarası |

### Kalıp Yer Tutucuları {#pattern-placeholders}

| Yer Tutucu | Açıklama | Örnek |
|-------------|-------------|---------|
| `{{index}}` | `startIndex` değerinden başlayan sıralı numara | `1`, `2`, `3` |
| `{{padded}}` | Sıfır dolgulu sıralı numara | `01`, `02`, `03` |
| `{{original}}` | Uzantısız özgün dosya adı | `photo`, `IMG_001` |

Özgün dosya uzantısı her zaman korunur.

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/bulk-rename \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F "file=@photo3.jpg" \
  -F 'settings={"pattern": "vacation-{{padded}}", "startIndex": 1}'
```

Bu şunu üretir: `vacation-1.jpg`, `vacation-2.jpg`, `vacation-3.jpg`

Özgün dosya adını kullanma:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/bulk-rename \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@IMG_001.jpg" \
  -F "file=@IMG_002.jpg" \
  -F 'settings={"pattern": "2024-trip-{{original}}-{{index}}"}'
```

Bu şunu üretir: `2024-trip-IMG_001-1.jpg`, `2024-trip-IMG_002-2.jpg`

## Örnek Yanıt {#example-response}

Yanıt, doğrudan akıtılan bir ZIP dosyasıdır (JSON yanıtı değil). Yanıt üst bilgileri şunlardır:

```
Content-Type: application/zip
Content-Disposition: attachment; filename="renamed-a1b2c3d4.zip"
```

## Notlar {#notes}

- Bu araç görselleri işlemez. Yalnızca dosyaları yeniden adlandırır ve bir ZIP arşivine paketler.
- `{{padded}}` için sıfır dolgu genişliği, toplam dosya sayısına göre otomatik olarak belirlenir (ör. 100 dosya 3 haneli dolgu kullanır: `001`, `002` vb.).
- Dosya uzantıları özgün dosya adlarından korunur.
- Dosya adları, güvensiz karakterleri kaldırmak için temizlenir.
- En az bir dosya sağlanmalıdır.
