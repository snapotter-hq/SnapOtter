---
description: "テキストを大文字、小文字、タイトルケース、文頭のみ大文字などに変換します。"
i18n_source_hash: e15ff31ec4d6
i18n_provenance: machine
i18n_output_hash: f0900a1b380b
i18n_hash_version: 2
---

# Convert Case {#convert-case}

テキストを貼り付けて大文字小文字の形式を選び、結果をコピーします。テキストは自分の SnapOtter サーバーにのみ送信され、他には送られません。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/convert-case`

multipart フォームデータではなく JSON ボディを受け付け、ダウンロード用のファイルではなく変換後のテキストを返します。

## Parameters {#parameters}

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `text` | string | (必須) | 変換するテキスト。最大 1,000,000 文字。 |
| `mode` | string | (必須) | 下記のモードのいずれか。 |
| `locale` | string | (なし) | `tr` や `de` などの BCP 47 言語タグ。言語によって大文字小文字が変わる文字に使われます。指定しない場合、大文字小文字の扱いはすべての言語で同じです。 |

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

- `title` は、短い英単語(a、an、and、of、the、to など)を、行頭または行末にある場合を除いて小文字のままにします。`capitalized` はすべての単語を大文字で始めます。
- `sentence` は、テキストの先頭、改行の後、および `.`、`!`、`?`、`…` の後にスペースが続く位置で新しい文を開始します。そのため `snapotter.com` や `3.5` のドットは数えられません。
- `camel`、`pascal`、`snake`、`kebab` は、スペース、句読点、既存の大文字小文字の切り替わり(`XMLHttpRequest` は `xml_http_request` になります)で区切り、各行を個別に変換します。
- `locale` を `tr` に設定すると、`i` は `İ` に大文字化され、`I` は `ı` に小文字化されます。ドイツ語の `ß` は、どのロケールでも `SS` に大文字化されます。
- Web アプリは、現在の表示言語を `locale` として送信します。
