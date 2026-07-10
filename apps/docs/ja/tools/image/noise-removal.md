---
description: "複数の品質ティアオプションを備えた AI ノイズ・粒状感除去。"
i18n_source_hash: f0dfc876e0e0
i18n_provenance: human
i18n_output_hash: d50068ef71e8
---

# ノイズ除去 {#noise-removal}

Python サイドカー（SCUNet モデル）を使用した、複数の品質ティアオプションを備えた AI ノイズ・粒状感除去。

## API エンドポイント {#api-endpoint}

`POST /api/v1/tools/image/noise-removal`

**処理:** 非同期（202 を返し、SSE 経由で `/api/v1/jobs/{jobId}/progress` をポーリングしてステータスを取得）

**モデルバンドル:** `upscale-enhance`（5～6 GB）

## パラメーター {#parameters}

| パラメーター | 型 | 必須 | デフォルト | 説明 |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | 画像ファイル（マルチパート） |
| tier | string | No | `"balanced"` | 品質ティア: `quick`, `balanced`, `quality`, `maximum` |
| strength | number | No | `50` | ノイズ除去の強度（0～100） |
| detailPreservation | number | No | `50` | 保持するディテールの量（0～100）。値が高いほどテクスチャがより多く保持される |
| colorNoise | number | No | `30` | カラーノイズ低減の強度（0～100） |
| format | string | No | `"original"` | 出力フォーマット: `original`, `png`, `jpeg`, `webp`, `avif`, `jxl` |
| quality | number | No | `90` | 出力エンコード品質（1～100） |

## リクエスト例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/noise-removal \
  -F "file=@noisy-photo.jpg" \
  -F 'settings={"tier":"quality","strength":60,"detailPreservation":70,"colorNoise":40}'
```

## レスポンス {#response}

### 初期レスポンス（202 Accepted） {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### 進捗（`/api/v1/jobs/{jobId}/progress` の SSE） {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Denoising...","percent":65}
```

### 最終結果（SSE 経由） {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/noisy-photo_denoised.jpg",
    "originalSize": 500000,
    "processedSize": 380000
  }
}
```

## 注意事項 {#notes}

- `upscale-enhance` モデルバンドル（5～6 GB）のインストールが必要です。
- 品質ティアは速度と品質のトレードオフです。`quick` は基本的なノイズ除去で最速、`maximum` は最も入念なマルチパス方式を使用します。
- `detailPreservation` パラメーターは、テクスチャのある被写体（布地、髪、葉）に対して重要です。値を高くすると、ノイズ除去処理が細かいディテールを滑らかにしてしまうのを防ぎます。
- `format` が `"original"` に設定されている場合、出力フォーマットは入力ファイルのフォーマットに一致します。
- HEIC/HEIF、RAW、TGA、PSD、EXR、HDR の入力フォーマットを自動デコードでサポートします。
