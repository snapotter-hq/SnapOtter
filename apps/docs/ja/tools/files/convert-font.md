---
description: "フォントを TTF、OTF、WOFF、WOFF2 の間で変換します。"
i18n_source_hash: a17c8ef18e42
i18n_provenance: machine
i18n_output_hash: 4637a763cb5d
i18n_hash_version: 2
---

# フォント変換 {#convert-font}

フォントファイルを TrueType (TTF)、OpenType CFF (OTF)、WOFF、WOFF2 の間で変換します。デスクトップフォントを Web フォントにしたり、TrueType しか受け付けないアプリのために OTF から TTF を作ったりするときに使います。

## API エンドポイント {#api-endpoint}

`POST /api/v1/tools/files/convert-font`

`.ttf`、`.otf`、`.woff`、`.woff2` のいずれかのファイルと JSON の `settings` フィールドを含む multipart フォームデータを受け付けます。

## パラメータ {#parameters}

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|------|----------|---------|-------------|
| format | string | いいえ | `ttf` | 出力形式: `ttf`、`otf`、`woff`、`woff2` |

## リクエスト例 {#example-request}

OTF から TTF へ:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-font \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@MyFont.otf" \
  -F 'settings={"format": "ttf"}'
```

Web 用に TTF から WOFF2 へ:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-font \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@MyFont.ttf" \
  -F 'settings={"format": "woff2"}'
```

## レスポンス例 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/MyFont.ttf",
  "originalSize": 48120,
  "processedSize": 61344
}
```

## 注意事項 {#notes}

- WOFF と WOFF2 は同じフォントデータを圧縮して包んだ形式なので、これらへの変換やこれらからの変換でアウトラインは変わりません。
- OTF から TTF への変換では、3 次 (CFF) 曲線を 2 次の TrueType 曲線に変換します。各曲線は元の曲線から 1 フォント単位以内に収まり、通常のサイズでは見分けがつきませんが、この変換は厳密には元に戻せません。TTF から OTF への変換は曲線の形を保ち、制御点を整数のフォント単位に丸めるだけです。
- フォントの埋め込み許可 (OS/2 の `fsType` フィールド) はそのまま保持されます。
- フォントコレクション (`.ttc`) には対応していません。可変 TrueType フォントは OTF に、可変 CFF2 フォントは TTF に変換できません。これらは代わりに WOFF か WOFF2 に変換してください。
- 変換は API プロセス内ではなく Python のドキュメントワーカーで実行され、タイムアウトは他のドキュメントツールと同じです。
