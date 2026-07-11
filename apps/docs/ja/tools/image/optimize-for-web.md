---
description: "フォーマット変換、品質制御、リサイズ、メタデータ除去で画像を Web 配信向けに最適化します。"
i18n_source_hash: c327bbbce768
i18n_provenance: human
i18n_output_hash: 320e91cbde2f
---

# Web 向け最適化 {#optimize-for-web}

画像を 1 ステップで Web 配信向けに最適化します。フォーマット変換、品質調整、任意のリサイズ、プログレッシブエンコード、メタデータ除去を組み合わせます。

## API エンドポイント {#api-endpoint}

`POST /api/v1/tools/image/optimize-for-web`

画像ファイルと JSON の `settings` フィールドを含むマルチパートフォームデータを受け付けます。

`POST /api/v1/tools/image/optimize-for-web/preview` にはライブプレビュー用のエンドポイントも用意されており、処理済み画像をバイナリとして直接返します（ワークスペースは作成されません）。リアルタイムのパラメーター調整に使用できます。

## パラメーター {#parameters}

| パラメーター | 型 | 必須 | デフォルト | 説明 |
|-----------|------|----------|---------|-------------|
| format | string | No | `"webp"` | 出力フォーマット: `webp`, `jpeg`, `avif`, `png`, `jxl` |
| quality | number | No | `80` | 出力品質（1～100） |
| maxWidth | number | No | - | 最大幅（ピクセル）。これより広い画像は縮小されます。 |
| maxHeight | number | No | - | 最大高さ（ピクセル）。これより高い画像は縮小されます。 |
| progressive | boolean | No | `true` | プログレッシブ／インターレースエンコードを有効にする |
| stripMetadata | boolean | No | `true` | EXIF、GPS、ICC、XMP メタデータを除去する |

## リクエスト例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/optimize-for-web \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "webp", "quality": 75, "maxWidth": 1920}'
```

強めの圧縮で AVIF 向けに最適化:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/optimize-for-web \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "avif", "quality": 50, "maxWidth": 1200, "maxHeight": 800}'
```

## レスポンス例 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.webp",
  "originalSize": 4500000,
  "processedSize": 320000
}
```

### プレビューエンドポイントのレスポンス {#preview-endpoint-response}

プレビューエンドポイント（`/api/v1/tools/image/optimize-for-web/preview`）は、情報用ヘッダーとともにバイナリ画像を直接返します。

- `X-Original-Size` - 元のファイルサイズ（バイト単位）
- `X-Processed-Size` - 処理後のファイルサイズ（バイト単位）
- `X-Output-Filename` - URL エンコードされた出力ファイル名

## 注意事項 {#notes}

- このツールは、Web アセット向けのワンストップ最適化パイプラインとして設計されています。フォーマット変換、品質調整、最大寸法の制限、メタデータ除去を 1 回のパスで処理します。
- 出力ファイル名の拡張子は、選択したフォーマットに合わせて更新されます。
- JXL（JPEG XL）のエンコードには専用の CLI エンコーダーを使用します。画像はまず PNG として処理され、その後 JXL にエンコードされます。
- プログレッシブエンコードは、完全な画像が読み込まれる前にブラウザーが低品質のプレビューを表示できるようにすることで、JPEG と PNG の体感的な読み込み時間を改善します。
- プレビューエンドポイントは軽量で（ワークスペースやジョブを作成しません）、フロントエンドのライブパラメーター調整 UI 向けに用意されています。
