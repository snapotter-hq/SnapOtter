---
description: "単色、透明、またはぼかし背景で、画像を目標のアスペクト比までパディングします。"
i18n_source_hash: 796122da3dae
i18n_provenance: human
i18n_output_hash: a2f14a3c006b
---

# 画像パディング {#image-pad}

画像の周囲に単色、透明、またはぼかし背景を追加することで、目標のアスペクト比までパディングします。トリミングせずに、ソーシャルメディアや印刷用の固定アスペクト比に画像を収めるのに便利です。

## API エンドポイント {#api-endpoint}

`POST /api/v1/tools/image/image-pad`

画像ファイルと JSON `settings` フィールドを含む multipart フォームデータを受け付けます。

## パラメーター {#parameters}

| パラメーター | 型 | 必須 | デフォルト | 説明 |
|-----------|------|----------|---------|-------------|
| target | string | いいえ | `"1:1"` | 目標のアスペクト比: `16:9`、`9:16`、`1:1`、`4:3`、`3:4`、または `custom` |
| ratioW | integer | いいえ | `1` | カスタム比率の幅（1〜100、target が `custom` の場合に使用） |
| ratioH | integer | いいえ | `1` | カスタム比率の高さ（1〜100、target が `custom` の場合に使用） |
| background | string | いいえ | `"color"` | 背景モード: `color`、`transparent`、または `blur` |
| color | string | いいえ | `"#ffffff"` | 背景の 16 進カラー（background が `color` の場合） |
| padding | integer | いいえ | `0` | キャンバスに対するパーセンテージでの追加パディング（0〜50） |

## リクエスト例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-pad \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"target": "16:9", "background": "blur", "padding": 5}'
```

## レスポンス例 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 3100000
}
```

## 注記 {#notes}

- `blur` 背景モードは、元画像のぼかしコピーをパディングの塗りつぶしとして作成し、視覚的にまとまりのある結果を生成します。
- `transparent` 背景を使用する場合、アルファを保持するために出力は PNG に変換されます。
- 透明度が関係しない限り、出力形式は入力形式と一致します。HEIC、RAW、PSD、SVG 入力は、処理前に自動的にデコードされます。
- 任意のアスペクト比（例: 3:2 の場合は `ratioW: 3, ratioH: 2`）には、`target` を `custom` に設定し、`ratioW` と `ratioH` を指定します。
