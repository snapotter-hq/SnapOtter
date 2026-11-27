---
description: "テキストを Base64 にエンコードしたり、Base64 をテキストにデコードしたりします。"
i18n_source_hash: 0e26f17348d3
i18n_provenance: machine
i18n_output_hash: 33dff4de59ab
i18n_hash_version: 2
---

# Base64 Encode / Decode {#base64}

テキストを貼り付けると Base64 が得られ、Base64 を貼り付けると元のテキストに戻ります。結果はそのままコピーできます。テキストは自分の SnapOtter サーバーにのみ送信され、他には送られません。

画像を Base64 に変換するには、代わりに [Image to Base64](/ja/tools/image/image-to-base64) を使用してください。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/base64`

multipart フォームデータではなく JSON ボディを受け付け、ダウンロード用のファイルではなく変換後のテキストを返します。

## Parameters {#parameters}

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `text` | string | (必須) | エンコードするテキスト、またはデコードする Base64。最大 1,000,000 文字。 |
| `mode` | string | (必須) | `encode` または `decode`。 |
| `urlSafe` | boolean | `false` | エンコード時に URL セーフなアルファベット(`-` と `_`)を使用し、`=` のパディングを省きます。デコード時は無視されます。 |

## Example Request {#example-request}

エンコード:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello, World!", "mode": "encode"}'
```

デコード:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "SGVsbG8sIFdvcmxkIQ==", "mode": "decode"}'
```

## Example Response {#example-response}

```json
{
  "mode": "encode",
  "result": "SGVsbG8sIFdvcmxkIQ=="
}
```

## Notes {#notes}

- テキストは UTF-8 としてエンコードされるため、アクセント付き文字、CJK、絵文字も欠けることなく往復できます。
- デコードではスペースと改行が無視されるため、76 桁で折り返された Base64(メールや PEM 本体)も貼り付けたままデコードできます。
- デコードでは、`=` パディングの有無にかかわらず、標準(`+`、`/`)と URL セーフ(`-`、`_`)のどちらのアルファベットも受け付けますが、両者の混在は受け付けません。
- Base64 ではない入力は、400 とコード `ENCODED_TEXT_INVALID` で失敗します。有効な Base64 でも、デコード結果が UTF-8 テキストではなくバイナリデータ(画像や ZIP など)の場合は、`DECODED_DATA_NOT_TEXT` で失敗します。
