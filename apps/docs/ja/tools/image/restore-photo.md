---
description: "復元、顔の補正、着色のための AI パイプラインで、古い写真の傷、破れ、損傷を修復します。"
i18n_source_hash: 3de13284216c
i18n_provenance: human
i18n_output_hash: bf379afff59d
---

# 写真復元 {#photo-restoration}

複数ステップの AI パイプラインを使って、古い写真の傷、破れ、損傷を修復します。傷の修復、顔の補正、ノイズ除去、任意の着色を組み合わせます。

## API エンドポイント {#api-endpoint}

`POST /api/v1/tools/image/restore-photo`

**処理:** 非同期（202 を返し、SSE 経由で `/api/v1/jobs/{jobId}/progress` をポーリングしてステータスを取得）

**モデルバンドル:** `photo-restoration`（4～5 GB）

## パラメーター {#parameters}

| パラメーター | 型 | 必須 | デフォルト | 説明 |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | 画像ファイル（マルチパート） |
| scratchRemoval | boolean | No | `true` | 傷や表面の損傷を除去する |
| faceEnhancement | boolean | No | `true` | 復元した写真内の顔を補正する |
| fidelity | number | No | `0.7` | 顔補正の忠実度（0～1）。値が高いほど元の特徴をより多く保持する |
| denoise | boolean | No | `true` | 復元結果にノイズ除去を適用する |
| denoiseStrength | number | No | `25` | ノイズ除去の強度（0～100） |
| colorize | boolean | No | `false` | 復元した写真を着色する（グレースケール画像向け） |
| colorizeStrength | number | No | `85` | 着色の強度（0～100） |

## リクエスト例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/restore-photo \
  -F "file=@damaged-old-photo.jpg" \
  -F 'settings={"scratchRemoval":true,"faceEnhancement":true,"fidelity":0.6,"colorize":true}'
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
data: {"phase":"processing","stage":"Removing scratches...","percent":30}
```

```
event: progress
data: {"phase":"processing","stage":"Enhancing faces...","percent":60}
```

### 最終結果（SSE 経由） {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/damaged-old-photo_restored.jpg",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 200000,
    "processedSize": 350000,
    "width": 1200,
    "height": 900,
    "steps": ["scratch_removal", "face_enhancement", "denoise", "colorize"],
    "scratchCoverage": 12.5,
    "facesEnhanced": 2,
    "isGrayscale": true,
    "colorized": true
  }
}
```

## 注意事項 {#notes}

- `photo-restoration` モデルバンドル（4～5 GB）のインストールが必要です。
- パイプラインは複数の AI ステップを順番に実行します。傷の修復、顔の補正（GFPGAN）、ノイズ除去、そして任意の着色です。
- 結果の `steps` 配列は、実際に実行された処理ステップを示します。
- `scratchCoverage` は、傷の損傷があった画像領域の推定パーセンテージです。
- `fidelity` は、顔を元の見た目を保持することに対してどれだけ強く補正するかを制御します。値が低いほど補正が強くなり、値が高いほど控えめになります。
- `colorize` オプションは、画像がグレースケールかどうかを自動検出します。結果の `isGrayscale` フラグがこの検出を確認します。
- 出力フォーマットは自動的に入力フォーマットに一致します。
- HEIC/HEIF、RAW、TGA、PSD、EXR、HDR、AVIF の入力フォーマットを自動デコードでサポートします。
