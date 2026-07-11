---
description: "カスタムのシャドウ色とハイライト色による2色のデュオトーン効果を適用します。"
i18n_source_hash: ab99c4f0152c
i18n_provenance: human
i18n_output_hash: b0ff7676e5de
---

# デュオトーン {#duotone}

画像に2色のデュオトーン効果を適用します。画像はグレースケールに変換され、シャドウ色（暗いトーン）とハイライト色（明るいトーン）の間のグラデーションにマッピングされます。

## API エンドポイント {#api-endpoint}

`POST /api/v1/tools/image/duotone`

画像ファイルとJSONの `settings` フィールドを含むmultipartフォームデータを受け付けます。

## パラメータ {#parameters}

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|------|----------|---------|-------------|
| shadow | string | いいえ | `"#1e3a8a"` | シャドウの16進数カラー（暗いトーンに適用） |
| highlight | string | いいえ | `"#fbbf24"` | ハイライトの16進数カラー（明るいトーンに適用） |
| intensity | integer | いいえ | `100` | 効果の強度（0〜100）。0は元の画像を返し、100はデュオトーンをフルに適用します |

## リクエスト例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/duotone \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"shadow": "#0f172a", "highlight": "#f97316", "intensity": 80}'
```

## レスポンス例 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 1870000
}
```

## 補足 {#notes}

- 出力形式は入力形式に一致します。HEIC、RAW、PSD、SVG の入力は処理前に自動でデコードされます。
- `intensity` が100未満の場合、デュオトーン結果を元の画像とブレンドし、より控えめな効果を得られます。
- 人気のデュオトーンの組み合わせには、ネイビー/ゴールド、ティール/コーラル、パープル/ピンクがあります。
