---
description: "Bir görseli, köşeleri saydam olacak şekilde ortalanmış bir daireye kırpın."
i18n_source_hash: 06c50ccd96b2
i18n_provenance: human
i18n_output_hash: c9ea430aab8c
---

# Daire Kırpma {#circle-crop}

Bir görseli, köşeleri saydam olacak şekilde ortalanmış bir daireye kırpın. Ayarlanabilir yakınlaştırma, konum kayması, kenarlık ve çıktı boyutunu destekler.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/image/circle-crop`

Bir görsel dosyası ve bir JSON `settings` alanı içeren multipart form verisi kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| zoom | sayı | Hayır | `1` | Yakınlaştırma faktörü (1-5); daha yüksek değerler daha sıkı kırpar |
| offsetX | sayı | Hayır | `0.5` | Yatay merkez konumu (0-1) |
| offsetY | sayı | Hayır | `0.5` | Dikey merkez konumu (0-1) |
| borderWidth | tam sayı | Hayır | `0` | Piksel cinsinden kenarlık genişliği (0-200) |
| borderColor | dize | Hayır | `"#ffffff"` | Onaltılık kenarlık rengi |
| background | dize | Hayır | `"transparent"` | Köşe doldurma: `"transparent"` veya bir onaltılık renk |
| outputSize | tam sayı | Hayır | - | Piksel cinsinden nihai kare boyutu (16-4096) |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/circle-crop \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"zoom": 1.2, "borderWidth": 4, "borderColor": "#333333"}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.png",
  "originalSize": 2450000,
  "processedSize": 185000
}
```

## Notlar {#notes}

- Saydam köşeleri korumak için çıktı her zaman PNG'dir (`background` düz bir renge ayarlanmadıkça).
- Daire, görselin kısa kenarına yazılır. Daha sıkı kırpmak için `zoom`, görünür alanı kaydırmak için `offsetX`/`offsetY` kullanın.
- `outputSize` sağlandığında, sonuç kırpmanın ardından bu kare boyutuna yeniden boyutlandırılır.
- HEIC, RAW, PSD ve SVG girişleri işlenmeden önce otomatik olarak çözülür.
