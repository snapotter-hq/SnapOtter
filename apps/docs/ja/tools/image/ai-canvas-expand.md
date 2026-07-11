---
description: "AI アウトペインティングで画像キャンバスを拡張し、任意の方向に広げて新しい領域を元の画像に合わせて埋めます。"
i18n_source_hash: 1b00db4ed40d
i18n_provenance: human
i18n_output_hash: 1d19a538f275
---

# AI Canvas Expand {#ai-canvas-expand}

AI 対応のフィル (アウトペインティング) で画像のキャンバスを拡張します。任意の方向に画像を広げ、既存の画像に合わせた AI 生成コンテンツで新しい領域を埋めます。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/ai-canvas-expand`

**処理:** 非同期 (202 を返し、SSE でステータスを `/api/v1/jobs/{jobId}/progress` からポーリング)

**モデルバンドル:** `object-eraser-colorize` (1 ～ 2 GB)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | 画像ファイル (マルチパート) |
| extendTop | integer | No | `0` | 上方向に拡張するピクセル数 |
| extendRight | integer | No | `0` | 右方向に拡張するピクセル数 |
| extendBottom | integer | No | `0` | 下方向に拡張するピクセル数 |
| extendLeft | integer | No | `0` | 左方向に拡張するピクセル数 |
| tier | string | No | `"balanced"` | 品質ティア: `fast`、`balanced`、`high` |
| format | string | No | `"auto"` | 出力形式: `auto`、`png`、`jpg`、`jpeg`、`webp`、`tiff`、`gif`、`avif`、`heic`、`heif`、`jxl` |
| quality | integer | No | `95` | 出力品質 (1 ～ 100) |

拡張方向のうち少なくとも 1 つは 0 より大きくする必要があります。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/ai-canvas-expand \
  -F "file=@photo.jpg" \
  -F 'settings={"extendTop":200,"extendBottom":200,"extendLeft":100,"extendRight":100,"tier":"balanced"}'
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
data: {"phase":"processing","stage":"Expanding canvas...","percent":50}
```

### Final Result (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_extended.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 300000,
    "processedSize": 520000
  }
}
```

## Notes {#notes}

- `object-eraser-colorize` モデルバンドルのインストールが必要です (1 ～ 2 GB)。
- LaMa ベースのアウトペインティングを使用して、拡張された領域のコンテンツを生成します。
- `tier` パラメータは速度と品質のトレードオフです。`fast` はアーティファクトが生じる可能性はあるものの素早く結果を生成し、`high` はより時間がかかりますが、より滑らかで一貫性のあるフィルを生成します。
- 拡張値はピクセル単位です。最終的な画像サイズは、元の幅 + extendLeft + extendRight × 元の高さ + extendTop + extendBottom になります。
- ブラウザでプレビューできない出力形式 (HEIC、JXL、TIFF) の場合、メイン出力とともに WebP プレビューが生成されます。
- HEIC/HEIF、RAW、TGA、PSD、EXR、HDR の入力形式を自動デコードでサポートします。
