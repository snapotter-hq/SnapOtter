---
description: "Real-ESRGANのAI超解像で細部を保ちながら画像を2〜4倍に拡大します。"
i18n_source_hash: 150032e99476
i18n_provenance: human
i18n_output_hash: 98f9f12f031b
---

# Image Upscaling {#image-upscaling}

Real-ESRGANを用いたAI超解像による高精細化です。細部を保ちながら画像を2〜4倍に拡大します。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/upscale`

**処理:** 非同期（202を返し、`/api/v1/jobs/{jobId}/progress`をSSEでポーリングしてステータスを取得）

**モデルバンドル:** `upscale-enhance`（5〜6 GB）

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | 画像ファイル（multipart） |
| scale | number | No | `2` | 拡大倍率（例: 2, 3, 4） |
| model | string | No | `"auto"` | 使用するモデル（例: `auto`、特定のモデル名） |
| faceEnhance | boolean | No | `false` | 拡大時に顔補正を適用します |
| denoise | number | No | `0` | ノイズ除去の強度（0 = 無効） |
| format | string | No | `"auto"` | 出力フォーマット: `auto`, `png`, `jpg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| quality | number | No | `95` | 出力品質（1〜100） |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/upscale \
  -F "file=@photo.jpg" \
  -F 'settings={"scale":4,"model":"auto","faceEnhance":true,"format":"png"}'
```

## Response {#response}

### Initial Response (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Progress (SSE at `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Upscaling...","percent":60}
```

### Final Result (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_4x.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 120000,
    "processedSize": 2400000,
    "width": 4096,
    "height": 4096,
    "method": "realesrgan-x4plus"
  }
}
```

## Notes {#notes}

- `upscale-enhance`モデルバンドルのインストールが必要です（5〜6 GB）。
- 利用可能な場合はReal-ESRGANを使用します。AIモデルが利用できない場合はLanczos補間にフォールバックします。
- `faceEnhance`オプションは、より良い顔品質のため、拡大時にGFPGANの顔復元を適用します。
- ブラウザでプレビューできない出力フォーマット（HEIC、JXL、TIFF）については、メイン出力とあわせてWebPプレビューが生成されます。
- HEIC/HEIF、RAW、TGA、PSD、EXR、HDRの入力フォーマットに、自動デコードで対応します。
