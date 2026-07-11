---
description: "消去したい領域のマスクに従い、AIインペインティング（LaMa）で画像から不要なオブジェクトを削除します。"
i18n_source_hash: 8e2e42a5e4f9
i18n_provenance: human
i18n_output_hash: c8fd8664cb28
---

# オブジェクト消去 {#object-eraser}

AIインペインティング（LaMaモデル）を使って画像から不要なオブジェクトを削除します。画像と、消去する領域を示すマスクを受け付けます。

## API エンドポイント {#api-endpoint}

`POST /api/v1/tools/image/erase-object`

**処理:** 非同期（202を返し、SSE経由でステータスを取得するには `/api/v1/jobs/{jobId}/progress` をポーリング）

**モデルバンドル:** `object-eraser-colorize`（1〜2 GB）

## パラメータ {#parameters}

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|------|----------|---------|-------------|
| file | file | はい | - | ソース画像ファイル（multipart） |
| mask | file | はい | - | マスク画像（白 = 消去する領域、黒 = 保持）。フィールド名 `mask` でアップロードする必要があります |
| format | string | いいえ | `"auto"` | 出力形式: `auto`、`png`、`jpg`、`jpeg`、`webp`、`tiff`、`gif`、`avif`、`heic`、`heif`、`jxl` |
| quality | integer | いいえ | `95` | 出力品質（1〜100） |

## リクエスト例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/erase-object \
  -F "file=@photo.jpg" \
  -F "mask=@mask.png" \
  -F "format=png" \
  -F "quality=95"
```

## レスポンス {#response}

### 初回レスポンス（202 Accepted） {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### 進捗（`/api/v1/jobs/{jobId}/progress` でのSSE） {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Inpainting...","percent":70}
```

### 最終結果（SSE経由） {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_erased.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 245000,
    "processedSize": 230000
  }
}
```

## 補足 {#notes}

- `object-eraser-colorize` モデルバンドル（1〜2 GB）のインストールが必要です。
- マスクはソース画像と同じ寸法でなければなりません。白いピクセルは消去する領域を示し、AIがそれらをもっともらしい内容で埋めます。
- 高品質なオブジェクト削除にLaMa（Large Mask Inpainting）を使用します。
- ブラウザでプレビューできない出力形式の場合、メイン出力と併せてWebPプレビューが生成されます。
- HEIC/HEIF、RAW、TGA、PSD、EXR、HDR の入力形式に自動デコードで対応します。
