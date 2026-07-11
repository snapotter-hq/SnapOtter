---
description: "ピクセル、パーセンテージ、またはフィットモードで画像をリサイズします。"
i18n_source_hash: 00d1bffa4d38
i18n_provenance: human
i18n_output_hash: 73a139cca480
---

# リサイズ {#resize}

正確なピクセル寸法、パーセンテージによる拡大縮小率、または画像をターゲット寸法にどう適応させるかを制御するフィットモードを指定して、画像をリサイズします。

## API エンドポイント {#api-endpoint}

`POST /api/v1/tools/image/resize`

画像ファイルと JSON の `settings` フィールドを含むマルチパートフォームデータを受け付けます。

## パラメーター {#parameters}

| パラメーター | 型 | 必須 | デフォルト | 説明 |
|-----------|------|----------|---------|-------------|
| width | integer | No | - | ターゲット幅（ピクセル、最大 16383） |
| height | integer | No | - | ターゲット高さ（ピクセル、最大 16383） |
| fit | string | No | `"contain"` | 画像を寸法にどう合わせるか: `contain`, `cover`, `fill`, `inside`, `outside` |
| withoutEnlargement | boolean | No | `false` | 画像がターゲットより小さい場合に拡大を防ぐ |
| percentage | number | No | - | パーセンテージでスケールする（例: 半分のサイズなら 50） |

`width`、`height`、`percentage` のうち少なくとも 1 つを指定する必要があります。

### フィットモード {#fit-modes}

- **contain** - アスペクト比を保持したまま寸法内に収まるようリサイズ（余白が残る場合あり）
- **cover** - アスペクト比を保持したまま寸法を覆うようにリサイズ（切り抜かれる場合あり）
- **fill** - 寸法に正確に一致するよう引き伸ばす（アスペクト比を無視）
- **inside** - `contain` と同様だが、縮小のみで拡大はしない
- **outside** - `cover` と同様だが、縮小のみで拡大はしない

## リクエスト例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"width": 800, "height": 600, "fit": "contain"}'
```

パーセンテージでリサイズ:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"percentage": 50}'
```

## レスポンス例 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 980000
}
```

## 注意事項 {#notes}

- どちらの軸も最大寸法は 16383 ピクセルです（Sharp/libvips の制限）。
- 出力フォーマットは入力フォーマットに一致します。HEIC、RAW、PSD、SVG の入力は処理前に自動的にデコードされます。
- リサイズ前に EXIF の向きが自動適用されます。
- `withoutEnlargement` フラグは、一部の画像がすでにターゲットより小さい可能性があるバッチ処理で便利です。
