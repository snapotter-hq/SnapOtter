---
description: "カメラのフラッシュによる赤目を AI で検出・補正します。"
i18n_source_hash: 647c6ff1ef7c
i18n_provenance: human
i18n_output_hash: 87d613a0e743
---

# 赤目補正 {#red-eye-removal}

カメラのフラッシュによる赤目を AI で検出・補正します。

## API エンドポイント {#api-endpoint}

`POST /api/v1/tools/image/red-eye-removal`

**処理:** 非同期（202 を返し、SSE 経由で `/api/v1/jobs/{jobId}/progress` をポーリングしてステータスを取得）

**モデルバンドル:** `face-detection`（200～300 MB）

## パラメーター {#parameters}

| パラメーター | 型 | 必須 | デフォルト | 説明 |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | 画像ファイル（マルチパート） |
| sensitivity | number | No | `50` | 赤目検出の感度（0～100）。値が高いほど、より薄い赤目も検出する |
| strength | number | No | `70` | 補正の強度（0～100）。赤みをどれだけ強く打ち消すか |
| format | string | No | - | 出力フォーマット（任意の上書き） |
| quality | number | No | `90` | 出力品質（1～100） |

## リクエスト例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/red-eye-removal \
  -F "file=@flash-photo.jpg" \
  -F 'settings={"sensitivity":60,"strength":80}'
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
data: {"phase":"processing","stage":"Detecting red eyes...","percent":40}
```

### 最終結果（SSE 経由） {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/flash-photo_redeye_fixed.png",
    "originalSize": 280000,
    "processedSize": 290000,
    "facesDetected": 2,
    "eyesCorrected": 4
  }
}
```

## 注意事項 {#notes}

- `face-detection` モデルバンドル（200～300 MB）のインストールが必要です。
- まず顔を検出し、次に各顔の中の目の領域を特定し、最後に赤目のピクセルを識別して補正します。
- `facesDetected` のカウントは見つかった顔の数を示します。`eyesCorrected` は赤目補正が行われた個々の目の総数です。
- 品質を最大限に保つため、出力は常に PNG です。
- HEIC/HEIF、RAW、TGA、PSD、EXR、HDR の入力フォーマットを自動デコードでサポートします。
