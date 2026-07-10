---
description: "SharpとAI顔検出を用いて、被写体・顔・エントロピーを認識しながら画像を賢くフレーミングして切り抜きます。"
i18n_source_hash: acbe1439c6d8
i18n_provenance: human
i18n_output_hash: 0effff4a667a
---

# Smart Crop {#smart-crop}

被写体認識、顔認識、またはトリムベースのスマートな切り抜きです。Sharpのattention/entropy戦略とAI顔検出を用いて、賢くフレーミングします。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/smart-crop`

**処理:** 非同期（202を返し、`/api/v1/jobs/{jobId}/progress`をSSEでポーリングしてステータスを取得）

**モデルバンドル:** `face-detection`（200〜300 MB）- `face`モードでのみ必要

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | 画像ファイル（multipart） |
| mode | string | No | `"subject"` | 切り抜きモード: `subject`, `face`, `trim`。（従来値の`attention`と`content`はそれぞれ`subject`と`trim`に対応します） |
| strategy | string | No | `"attention"` | subjectモードの戦略: `attention`または`entropy` |
| width | integer | No | - | 目標の幅（ピクセル） |
| height | integer | No | - | 目標の高さ（ピクセル） |
| padding | integer | No | `0` | 被写体周囲の余白の割合（0〜50） |
| facePreset | string | No | `"head-shoulders"` | 顔フレーミングのプリセット: `closeup`, `head-shoulders`, `upper-body`, `half-body` |
| sensitivity | number | No | `0.5` | 顔検出の感度（0〜1） |
| threshold | integer | No | `30` | トリムモードでの背景検出のしきい値（0〜255） |
| padToSquare | boolean | No | `false` | トリム結果を正方形にパディングします |
| padColor | string | No | `"#ffffff"` | パディングの背景色 |
| targetSize | integer | No | - | パディング済み出力の目標サイズ（ピクセル） |
| quality | integer | No | - | 出力品質（1〜100） |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/smart-crop \
  -F "file=@portrait.jpg" \
  -F 'settings={"mode":"face","width":1080,"height":1080,"facePreset":"head-shoulders"}'
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
data: {"phase":"processing","percent":50}
```

### Final Result (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/portrait_smartcrop.jpg",
    "originalSize": 500000,
    "processedSize": 320000
  }
}
```

## Modes {#modes}

### Subject Mode {#subject-mode}
Sharpのattentionまたはentropy戦略を用いて、視覚的に最も興味深い領域を見つけ、その周囲を切り抜きます。

### Face Mode {#face-mode}
AIで顔を検出し、指定した`facePreset`を用いて検出された顔の周囲を切り抜きます。顔が検出されない場合はsubjectモード（attention戦略）にフォールバックします。

### Trim Mode {#trim-mode}
画像から均一な余白/背景を取り除きます。オプションで、指定した背景色と目標サイズで結果を正方形にパディングします。

## Notes {#notes}

- このツールは`executionHint: "long"`を指定した`createToolRoute`ファクトリを使用するため、SSE進捗とともに202を返します。
- faceモードには`face-detection`モデルバンドル（200〜300 MB）が必要です。
- subjectモードとtrimモードはAIモデルバンドルなしで動作します。
- `facePreset`は、検出された顔をどれだけタイトにフレーミングするかを決定します。`closeup`が最もタイトで、`half-body`が最も広くなります。
- 幅/高さが指定されない場合、デフォルトは1080x1080です。
