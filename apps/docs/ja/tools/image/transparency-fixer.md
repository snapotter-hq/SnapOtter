---
description: "偽の透過PNGをAIマッティング（BiRefNet）で修正して本物のアルファを生成し、エッジのフリンジ除去も行います。"
i18n_source_hash: 7eb748b80f93
i18n_provenance: human
i18n_output_hash: 88c95b97a32d
---

# PNG Transparency Fixer {#png-transparency-fixer}

偽の透過PNGをワンクリックで修正します。AIマッティング（BiRefNet HR Mattingモデル）を用いて本物のアルファ透過を生成し、後処理のフリンジ除去でエッジをクリーンアップします。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/transparency-fixer`

**処理:** 非同期（202を返し、`/api/v1/jobs/{jobId}/progress`をSSEでポーリングしてステータスを取得）

**モデルバンドル:** `background-removal`（4〜5 GB）

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | 画像ファイル（multipart） |
| defringe | number | No | `30` | フリンジ除去の強度（0〜100）。エッジ周辺の半透明なフリンジピクセルを除去します |
| outputFormat | string | No | `"png"` | 出力フォーマット: `png`または`webp` |
| removeWatermark | boolean | No | `false` | ウォーターマーク除去の前処理（メディアンフィルター）を適用します |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/transparency-fixer \
  -F "file=@fake-transparent.png" \
  -F 'settings={"defringe":40,"outputFormat":"png"}'
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
data: {"phase":"processing","stage":"Processing transparency...","percent":50}
```

### Final Result (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/fake-transparent_fixed.png",
    "originalSize": 180000,
    "processedSize": 150000,
    "filename": "fake-transparent.png"
  }
}
```

## Notes {#notes}

- `background-removal`モデルバンドルのインストールが必要です（4〜5 GB）。
- 高品質なアルファマッティングの主モデルとして`birefnet-hr-matting`を使用します。HRモデルがメモリ不足になった場合は`birefnet-general`にフォールバックします。
- `defringe`オプションは、AIマッティングが髪、毛、細かなエッジの周囲にときどき残す半透明のフリンジピクセルを除去します。アルファチャンネルをぼかし、信頼度の低いピクセルをゼロにすることで機能します。
- `removeWatermark`オプションは、メディアンフィルターの前処理ステップを適用します。これは基本的なウォーターマーク低減であり、専用のウォーターマーク除去ツールではありません。
- 出力はPNGまたは可逆WebPのみです（どちらもアルファ透過をサポートします）。
- HEIC/HEIF、RAW、TGA、PSD、EXR、HDRの入力フォーマットに、自動デコードで対応します。
