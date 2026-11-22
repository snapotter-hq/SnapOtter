---
description: "將文字轉換為大寫、小寫、標題格式、句首大寫等。"
i18n_source_hash: e15ff31ec4d6
i18n_provenance: machine
i18n_output_hash: 36a1b84e2c13
i18n_hash_version: 2
---

# Convert Case {#convert-case}

貼上文字，選擇一種大小寫格式，然後複製結果。文字只會傳送到您自己的 SnapOtter 伺服器，不會傳送到其他任何地方。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/convert-case`

接受 JSON 請求本文而非 multipart 表單資料，並回傳轉換後的文字，而不是可下載的檔案。

## Parameters {#parameters}

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `text` | string | （必填） | 要轉換的文字。最多 1,000,000 個字元。 |
| `mode` | string | （必填） | 下列模式之一。 |
| `locale` | string | （無） | BCP 47 語言標籤，例如 `tr` 或 `de`，用於大小寫會因語言而異的字母。未指定時，所有語言的大小寫處理方式相同。 |

| Mode | Input | Output |
|------|-------|--------|
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

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-case \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "the lord of the rings", "mode": "title"}'
```

## Example Response {#example-response}

```json
{
  "mode": "title",
  "result": "The Lord of the Rings"
}
```

## Notes {#notes}

- `title` 會讓簡短的英文單字（a、an、and、of、the、to 等）保持小寫，除非它們位於行首或行尾。`capitalized` 會將每個單字的首字母大寫。
- `sentence` 會在文字開頭、換行之後，以及 `.`、`!`、`?` 或 `…` 後接空格的位置開始新的句子，因此 `snapotter.com` 或 `3.5` 中的點不算數。
- `camel`、`pascal`、`snake` 與 `kebab` 會依空格、標點符號與既有的大小寫變化處進行拆分（`XMLHttpRequest` 會變成 `xml_http_request`），並逐行單獨轉換。
- 當 `locale` 設為 `tr` 時，`i` 會轉為大寫 `İ`，`I` 會轉為小寫 `ı`。德語 `ß` 在所有地區設定中都會轉為大寫 `SS`。
- 網頁應用程式會將目前的介面語言作為 `locale` 傳送。
