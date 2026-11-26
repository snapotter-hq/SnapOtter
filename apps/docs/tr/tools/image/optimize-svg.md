---
description: "SVG dosyalarını svgo ile küçültün ve sonucu vektör SVG olarak koruyun; hassasiyet, çoklu geçiş, meta veri ve biçimlendirme denetimleriyle."
i18n_source_hash: c2601cc2cdd8
i18n_provenance: machine
i18n_output_hash: 0a99caf3c8f1
i18n_hash_version: 2
---

# SVG Optimize Et {#optimize-svg}

Düzenleyici artıklarını, gereksiz öznitelikleri ve fazla ondalık basamakları kaldırarak SVG dosyalarını küçültün ve sonucu SVG olarak indirin. “Web için Optimize Et” aracından farklı olarak çıktı hiçbir zaman rasterlaştırılmaz.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/image/optimize-svg`

Bir `.svg` veya `.svgz` dosyası ve bir JSON `settings` alanı içeren multipart form verisini kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| precision | number | Hayır | `3` | Yol verilerinde ve sayılarda korunan ondalık basamak sayısı (0 ile 8). Düşük değerler daha küçük dosyalar ve biraz daha kaba eğriler verir. |
| multipass | boolean | Hayır | `true` | Çıktı küçülmeyi bırakana kadar optimize ediciyi tekrar tekrar çalıştır |
| removeMetadata | boolean | Hayır | `true` | Yorumları, `<metadata>`, `<desc>` ve düzenleyiciye özgü verileri kaldır. Korumak için kapatın. |
| pretty | boolean | Hayır | `false` | Çıktıyı birkaç satıra sıkıştırmak yerine okunabilirlik için girintile |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/optimize-svg \
  -F "file=@logo.svg" \
  -F 'settings={"precision":3,"multipass":true,"removeMetadata":true,"pretty":false}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/logo.svg",
  "originalSize": 48213,
  "processedSize": 17904
}
```

## Notlar {#notes}

- Girdi bir SVG veya SVGZ dosyası olmalıdır. Bir raster görsel `400` ve `IMAGE_UNDECODABLE` koduyla reddedilir.
- `.svgz` girdisi önce açılır ve çıktı her zaman düz bir `.svg` dosyasıdır.
- SVG, açıldıktan sonra 2 MB ile sınırlıdır. Daha büyük bir dosya `400` ve `SVG_TOO_LARGE` koduyla reddedilir.
- `viewBox` ve `<title>` her zaman korunur, böylece grafik ölçeklenmeye devam eder ve erişilebilir adını korur.
- Girdi ve çıktı, betikleri ve diğer etkin içeriği kaldıran SVG temizleyicisinden geçer.
- `precision` değerini düşürmek, yol açısından yoğun çizimlerde en büyük boyut tasarrufunu sağlar. Sonucu 0 ile 2 arasında gözle kontrol edin.
