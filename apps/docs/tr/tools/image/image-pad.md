---
description: "Bir görseli düz renk, saydam veya bulanık arka planla hedef en boy oranına dolgulayın."
i18n_source_hash: 796122da3dae
i18n_provenance: human
i18n_output_hash: e270874ce92a
---

# Görsel Dolgusu {#image-pad}

Bir görselin çevresine düz renk, saydam veya bulanık bir arka plan ekleyerek onu hedef en boy oranına dolgulayın. Görselleri kırpmadan sosyal medya veya baskı için sabit en boy oranlarına sığdırmak için kullanışlıdır.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/image/image-pad`

Bir görsel dosyası ve bir JSON `settings` alanı içeren multipart form verisini kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| target | string | Hayır | `"1:1"` | Hedef en boy oranı: `16:9`, `9:16`, `1:1`, `4:3`, `3:4` veya `custom` |
| ratioW | integer | Hayır | `1` | Özel oran genişliği (1-100, target `custom` olduğunda kullanılır) |
| ratioH | integer | Hayır | `1` | Özel oran yüksekliği (1-100, target `custom` olduğunda kullanılır) |
| background | string | Hayır | `"color"` | Arka plan modu: `color`, `transparent` veya `blur` |
| color | string | Hayır | `"#ffffff"` | Arka plan hex rengi (background `color` olduğunda) |
| padding | integer | Hayır | `0` | Tuval yüzdesi olarak ekstra dolgu (0-50) |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-pad \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"target": "16:9", "background": "blur", "padding": 5}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 3100000
}
```

## Notlar {#notes}

- `blur` arka plan modu, dolgu doldurması olarak orijinal görselin bulanık bir kopyasını oluşturarak görsel açıdan tutarlı bir sonuç üretir.
- `transparent` arka plan kullanılırken, alfayı korumak için çıktı PNG'ye dönüştürülür.
- Saydamlık söz konusu olmadıkça çıktı biçimi giriş biçimiyle eşleşir. HEIC, RAW, PSD ve SVG girişleri işlemeden önce otomatik olarak çözümlenir.
- Rastgele en boy oranları için `target` değerini `custom` olarak ayarlayın ve `ratioW` ile `ratioH` değerlerini sağlayın (örn. 3:2 için `ratioW: 3, ratioH: 2`).
