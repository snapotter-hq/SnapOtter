---
description: "画像内の特定の色を別の色に置き換える、または透明にします。"
i18n_source_hash: df55ac451ecb
i18n_provenance: human
i18n_output_hash: 3cee4fe81477
---

# 色の置換・反転 {#replace-invert-color}

ソース色に一致するピクセルをターゲット色に置き換える、または透明にします。RGB 空間でのユークリッド距離を使い、設定可能な許容値で色の境界を滑らかにブレンドします。

## API エンドポイント {#api-endpoint}

`POST /api/v1/tools/image/replace-color`

画像ファイルと JSON の `settings` フィールドを含むマルチパートフォームデータを受け付けます。

## パラメーター {#parameters}

| パラメーター | 型 | 必須 | デフォルト | 説明 |
|-----------|------|----------|---------|-------------|
| sourceColor | string | No | `"#FF0000"` | 検出する 16 進カラー（形式: `#RRGGBB`） |
| targetColor | string | No | `"#00FF00"` | 置き換える 16 進カラー（形式: `#RRGGBB`） |
| makeTransparent | boolean | No | `false` | 一致するピクセルをターゲット色に置き換える代わりに透明にする |
| tolerance | number | No | `30` | 色一致の許容値（0～255）。値が高いほど、より広い範囲の類似色に一致する |

## リクエスト例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/replace-color \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"sourceColor": "#FF0000", "targetColor": "#0000FF", "tolerance": 40}'
```

緑の背景を透明にする:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/replace-color \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@greenscreen.png" \
  -F 'settings={"sourceColor": "#00FF00", "makeTransparent": true, "tolerance": 50}'
```

## レスポンス例 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.png",
  "originalSize": 2450000,
  "processedSize": 2100000
}
```

## 注意事項 {#notes}

- 色の一致には RGB 空間でのユークリッド距離を使用し、`tolerance * sqrt(3)` でスケーリングします。
- 置換のブレンドは色距離に比例します。ソース色に近いピクセルほどターゲット色を多く受け取り、滑らかな遷移を作り出します。
- `makeTransparent` が `true` の場合、入力フォーマットがアルファチャンネルをサポートしない（例: JPEG）ときは、出力が PNG（または WebP/AVIF）に強制されます。
- 許容値 0 は、完全に一致するソース色のみに一致します。値を高くする（50 以上）と、より広い範囲の類似した色相に一致します。
- 透明化が必要で入力フォーマットがアルファをサポートしない場合を除き、出力フォーマットは入力フォーマットに一致します。
