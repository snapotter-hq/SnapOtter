---
description: "Metni BÜYÜK, küçük, Başlık, Cümle biçimi ve daha fazlasına çevirin."
i18n_source_hash: e15ff31ec4d6
i18n_provenance: machine
i18n_output_hash: 0c3709760345
i18n_hash_version: 2
---

# Büyük/Küçük Harf Dönüştür {#convert-case}

Metni yapıştırın, bir harf biçimi seçin ve sonucu kopyalayın. Metin yalnızca kendi SnapOtter sunucunuza gider, başka hiçbir yere gitmez.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/files/convert-case`

Multipart form verisi değil, bir JSON gövdesi kabul eder ve indirilecek bir dosya yerine dönüştürülen metinle yanıt verir.

## Parametreler {#parameters}

| Ad | Tür | Varsayılan | Açıklama |
|------|------|---------|-------------|
| `text` | string | (zorunlu) | Dönüştürülecek metin. En fazla 1.000.000 karakter. |
| `mode` | string | (zorunlu) | Aşağıdaki modlardan biri. |
| `locale` | string | (yok) | Büyük/küçük harf biçimi dile bağlı olan harfler için `tr` veya `de` gibi bir BCP 47 dil etiketi. Bu olmadan harf biçimi her dil için aynıdır. |

| Mod | Girdi | Çıktı |
|-----|-------|-------|
| `upper` | `The quick brown fox` | `THE QUICK BROWN FOX` |
| `lower` | `The Quick Brown Fox` | `the quick brown fox` |
| `sentence` | `the quick BROWN fox. it jumps.` | `The quick brown fox. It jumps.` |
| `title` | `the lord of the rings` | `The Lord of the Rings` |
| `capitalized` | `the lord of the rings` | `The Lord Of The Rings` |
| `inverse` | `The Quick Brown Fox` | `tHE qUICK bROWN fOX` |
| `alternating` | `the quick brown fox` | `tHe QuIcK bRoWn FoX` |
| `camel` | `The quick brown fox` | `theQuickBrownFox` |
| `pascal` | `the quick brown fox` | `TheQuickBrownFox` |
| `snake` | `The quick brown fox` | `the_quick_brown_fox` |
| `kebab` | `The quick brown fox` | `the-quick-brown-fox` |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-case \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "the lord of the rings", "mode": "title"}'
```

## Örnek Yanıt {#example-response}

```json
{
  "mode": "title",
  "result": "The Lord of the Rings"
}
```

## Notlar {#notes}

- `title` kısa İngilizce sözcükleri (a, an, and, of, the, to ve benzerleri) satırın başında veya sonunda değillerse küçük harfle bırakır. `capitalized` her sözcüğü büyük harfle başlatır.
- `sentence` yeni bir cümleyi metnin başında, bir satır sonundan sonra ve ardından boşluk gelen `.`, `!`, `?` veya `…` işaretlerinden sonra başlatır, bu yüzden `snapotter.com` veya `3.5` içindeki nokta sayılmaz.
- `camel`, `pascal`, `snake` ve `kebab` boşluklardan, noktalama işaretlerinden ve mevcut harf biçimi değişimlerinden (`XMLHttpRequest` ifadesi `xml_http_request` olur) böler ve her satırı ayrı ayrı dönüştürür.
- `locale` `tr` olarak ayarlandığında, `i` büyük harfe `İ` olarak, `I` ise küçük harfe `ı` olarak dönüşür. Almanca `ß` her yerel ayarda büyük harfe `SS` olarak dönüşür.
- Web uygulaması geçerli arayüz dilini `locale` olarak gönderir.
