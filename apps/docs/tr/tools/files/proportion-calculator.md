---
description: "Üçlü kuralı çözün, üç bilinen değerden X'i bulun."
i18n_source_hash: e0c21822bdae
i18n_provenance: machine
i18n_output_hash: c96b7452fb9e
i18n_hash_version: 2
---

# Orantı Hesaplayıcı {#proportion-calculator}

Üçlü kuralı (çapraz çarpım) çözer. Üç değer yazın, doğru veya ters orantıyı seçin ve dördüncüyü alın. Değerler her cevaptan sonra formda kalır, bu yüzden bir sayıyı değiştirip Enter'a basarak bir sonrakini deneyebilirsiniz.

Bu, matematiksel orantı çözücüsüdür, fotoğraf kompozisyonunda kullanılan üçler kuralı ızgarası değildir.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/files/proportion-calculator`

Multipart form verisi değil, bir JSON gövdesi kabul eder ve indirilecek bir dosya yerine bir sayıyla yanıt verir.

## Parametreler {#parameters}

| Ad | Tür | Varsayılan | Açıklama |
|------|------|---------|-------------|
| `a` | number | (zorunlu) | Birinci bilinen değer. |
| `b` | number | (zorunlu) | `a` ile eşleşen değer. |
| `c` | number | (zorunlu) | Üçüncü bilinen değer. X, onunla eşleşen değerdir. |
| `mode` | string | `direct` | `direct` veya `inverse`. |

| Mod | Okunuşu | Formül | Örnek |
|-----|---------|--------|-------|
| `direct` | A'nın B'ye oranı, C'nin X'e oranı gibidir | X = B × C ÷ A | 3 elma 6 tutuyorsa 10 elma 20 tutar |
| `inverse` | A × B = C × X | X = A × B ÷ C | 4 işçi 6 günde bitiriyorsa 8 işçi 3 günde bitirir |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/proportion-calculator \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"a": 3, "b": 6, "c": 10, "mode": "direct"}'
```

## Örnek Yanıt {#example-response}

```json
{
  "mode": "direct",
  "x": 20
}
```

## Notlar {#notes}

- Cevap 15 anlamlı basamağa yuvarlanır, bu yüzden `0.1 × 3 ÷ 3` ifadesi `0.1` olarak döner, `0.10000000000000002` olarak değil.
- Her biri bölen olduğu için, `a` doğru orantıda `0` olamaz ve `c` ters orantıda `0` olamaz. İkisi de 400 döndürür.
- Bir double'ın tutabileceği aralığın dışındaki bir cevap (yaklaşık `1.8e308` üzerinde veya hassasiyetini koruyamayacak kadar sıfıra yakın) 400 döndürür.
- Web uygulamasında `1,5` veya `1.5` yazabilirsiniz, Arap-Hint veya Devanagari rakamları da çalışır. Binlik ayırıcılar kabul edilmez.
