---
description: "Görsellere kenarlıklar, dolgu, yuvarlatılmış köşeler ve gölgeler öngörülebilir, kontrol edilebilir bir sırayla ekleyin."
i18n_source_hash: 8845150736a9
i18n_provenance: human
i18n_output_hash: 8a6edc9ba0e2
---

# Kenarlık ve Çerçeve {#border-frame}

Görsellere kenarlıklar, dolgu, yuvarlatılmış köşeler ve gölgeler ekleyin. Araç efektleri şu sırayla uygular: dolgu, kenarlık, köşe yarıçapı, ardından gölge.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/image/border`

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| borderWidth | sayı | Hayır | 10 | Piksel cinsinden kenarlık kalınlığı (0 ile 2000 arası) |
| borderColor | dize | Hayır | `"#000000"` | Onaltılık olarak kenarlık rengi (ör. `#FF0000`) |
| padding | sayı | Hayır | 0 | Görsel ile kenarlık arasındaki piksel cinsinden iç dolgu (0 ile 200 arası) |
| paddingColor | dize | Hayır | `"#FFFFFF"` | Onaltılık olarak dolgu doldurma rengi |
| cornerRadius | sayı | Hayır | 0 | Piksel cinsinden köşe yarıçapı (0 ile 2000 arası) |
| shadow | boole | Hayır | `false` | Gölge eklenip eklenmeyeceği |
| shadowBlur | sayı | Hayır | 15 | Gölge bulanıklık yarıçapı (1 ile 200 arası) |
| shadowOffsetX | sayı | Hayır | 0 | Gölge yatay konumu (-50 ile 50 arası) |
| shadowOffsetY | sayı | Hayır | 5 | Gölge dikey konumu (-50 ile 50 arası) |
| shadowColor | dize | Hayır | `"#000000"` | Onaltılık olarak gölge rengi |
| shadowOpacity | sayı | Hayır | 40 | Gölge opaklık yüzdesi (0 ile 100 arası) |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/border \
  -F "file=@photo.jpg" \
  -F 'settings={"borderWidth":20,"borderColor":"#333333","cornerRadius":16,"shadow":true,"shadowBlur":25,"shadowOpacity":50}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.png",
  "originalSize": 456789,
  "processedSize": 523456
}
```

## Notlar {#notes}

- Standart `createToolRoute` fabrikasını kullanır. Multipart yükleme yoluyla tek bir görsel dosyası kabul eder.
- HEIC, RAW, PSD ve SVG giriş biçimlerini destekler (otomatik olarak çözülür).
- İşleme sırası: önce dolgu eklenir, ardından kenarlık çevresine sarılır, sonra köşe yarıçapı uygulanır, sonra gölge birleştirilir.
- `cornerRadius` veya `shadow` etkinleştirildiğinde, saydamlığı korumak için çıktı (giriş biçiminden bağımsız olarak) PNG'ye zorlanır. Alfayı destekleyen biçimler (PNG, WebP, AVIF) özgün biçimlerini korur.
- Gölge şekil duyarlıdır: dikdörtgen bir gölge oluşturmak yerine yuvarlatılmış köşeleri izler.
- `borderWidth` değerini 0'a ayarlayıp yalnızca `cornerRadius` + `shadow` kullanmak, çerçevesiz yuvarlatılmış bir gölge efekti oluşturur.
