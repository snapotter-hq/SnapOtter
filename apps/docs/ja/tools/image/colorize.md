---
description: "DDColor AIモデルで、白黒またはグレースケール写真を自動でカラー化します。"
i18n_source_hash: 688aa3abbdae
i18n_provenance: human
i18n_output_hash: c1439688f3be
---

# AIカラー化 {#ai-colorization}

AI（OpenCV DNNフォールバック付きのDDColorモデル）を使って、白黒またはグレースケール写真をフルカラーに変換します。

## API エンドポイント {#api-endpoint}

`POST /api/v1/tools/image/colorize`

**処理:** 非同期（202を返し、SSE経由でステータスを取得するには `/api/v1/jobs/{jobId}/progress` をポーリング）

**モデルバンドル:** `object-eraser-colorize`（1〜2 GB）

## パラメータ {#parameters}

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|------|----------|---------|-------------|
| file | file | はい | - | 画像ファイル（multipart） |
| intensity | number | いいえ | `1.0` | 色の強度（0〜1）。値が低いほどカラー化が控えめになります |
| model | string | いいえ | `"auto"` | 使用するモデル: `auto`、`ddcolor`、`opencv` |

## リクエスト例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/colorize \
  -F "file=@old-bw-photo.jpg" \
  -F 'settings={"intensity":0.9,"model":"auto"}'
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
data: {"phase":"processing","stage":"Colorizing...","percent":55}
```

### 最終結果（SSE経由） {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/old-bw-photo_colorized.jpg",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 180000,
    "processedSize": 210000,
    "width": 1920,
    "height": 1080,
    "method": "ddcolor"
  }
}
```

## 補足 {#notes}

- `object-eraser-colorize` モデルバンドル（1〜2 GB）のインストールが必要です。
- DDColorはより高品質な結果を生成しますが低速です。OpenCV DNNは高速でわずかに品質が劣ります。`auto` は利用可能な場合にDDColorを使用し、OpenCVをフォールバックとします。
- `intensity` パラメータは元のグレースケールとAIカラー化結果の間をブレンドします。フルカラーには1.0を、部分的に彩度を落としたビンテージ風の見た目には低い値を使用します。
- 出力形式は入力形式に自動で一致します。
- ブラウザでプレビューできない出力形式の場合、メイン出力と併せてWebPプレビューが生成されます。
- HEIC/HEIF、RAW、TGA、PSD、EXR、HDR の入力形式に自動デコードで対応します。
