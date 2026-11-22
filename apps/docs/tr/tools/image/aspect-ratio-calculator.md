---
description: "En boy oranını koruyan eksik genişlik veya yüksekliği hesaplayın ve oranı sadeleştirin."
i18n_source_hash: 2f975049563e
i18n_provenance: machine
i18n_output_hash: 0b8cb0d441b9
i18n_hash_version: 2
---

# En boy oranı hesaplayıcı {#aspect-ratio-calculator}

Özgün bir genişlik ve yükseklik girin, ardından yeni bir genişlik veya yeni bir yükseklik verin; oranlar korunacak şekilde diğer kenar size döndürülür. Oran en sade biçimde gelir, yani 1920 × 1080, 16:9 olur. Web uygulamasında yaygın bir orandan (16:9, 4:3, 3:2, 1:1, 21:9, 9:16, 4:5) başlayabilir ve yatay ile dikey arasında geçiş yapabilirsiniz.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/image/aspect-ratio-calculator`

Bir JSON gövdesi kabul eder (multipart form verisi değil) ve indirilecek bir dosya yerine sayılarla yanıt verir.

## Parametreler {#parameters}

| Parametre | Tür | Varsayılan | Açıklama |
|-----------|------|---------|-------------|
| `width` | sayı | (zorunlu) | Özgün genişlik. |
| `height` | sayı | (zorunlu) | Özgün yükseklik. |
| `newWidth` | sayı | - | Hedef genişlik. Yanıt, `newHeight` değerini bundan hesaplar. |
| `newHeight` | sayı | - | Hedef yükseklik. Yanıt, `newWidth` değerini bundan hesaplar. |
| `round` | boole | `true` | Hesaplanan kenarı tam sayıya yuvarlar. `false` olduğunda iki ondalık basamak korur. |

Her boyut `0.0001` ile `1000000` arasında olmalıdır. `newWidth` veya `newHeight` değerinden yalnızca birini gönderin, ikisini birden değil. Yalnızca sadeleştirilmiş oranı almak için ikisini de boş bırakın.

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/aspect-ratio-calculator \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"width": 1920, "height": 1080, "newWidth": 1280}'
```

## Örnek Yanıt {#example-response}

```json
{
  "width": 1920,
  "height": 1080,
  "ratio": "16:9",
  "ratioDecimal": 1.7778,
  "newWidth": 1280,
  "newHeight": 720
}
```

İstekte ikisi de gönderilmediğinde `newWidth` ve `newHeight` değeri `null` olur.

## Notlar {#notes}

- Kesirli boyutlar en fazla dört ondalık basamak kullanılarak tam sayılı bir orana indirgenir, bu nedenle `8.5` × `11` ölçüsü `17:22` olarak döner.
- `ratioDecimal`, genişliğin yüksekliğe bölünmesiyle bulunur ve dört ondalık basamağa yuvarlanır.
- Hesaplanan kenar hiçbir zaman `0` olarak dönmez. Yuvarlama açıkken en az `1`, kapalıyken en az `0.01` olur.
- `newWidth` ve `newHeight` değerlerinin ikisini birden göndermek ya da izin verilen aralığın dışında bir boyut vermek 400 döndürür.
- Hesaplayıcı hiçbir dosyayı okumaz veya yazmaz. Sayıları uygulamak için [Görüntü Boyutlandır](/tr/tools/image/resize) veya [Görüntü Kırp](/tr/tools/image/crop) aracını kullanın.
