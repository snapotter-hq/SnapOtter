---
description: "任意のエフェクト（ぼかし、影、グラデーション、カスタム背景）を備えた AI 背景除去。"
i18n_source_hash: 0814cd471fc1
i18n_provenance: human
i18n_output_hash: 0f130a012bde
---

# 背景除去 {#remove-background}

任意のエフェクト（ぼかし、影、グラデーション、カスタム背景）を備えた AI 背景除去。

## API エンドポイント {#api-endpoint}

`POST /api/v1/tools/image/remove-background`

**処理:** 非同期（202 を返し、SSE 経由で `/api/v1/jobs/{jobId}/progress` をポーリングしてステータスを取得）

**モデルバンドル:** `background-removal`（4～5 GB）

## パラメーター {#parameters}

フェーズ 1 は背景を除去し、透明 PNG マスクと元画像をキャッシュします。背景の置き換え、ぼかし、ドロップシャドウ、出力フォーマットの変換は、[フェーズ 2（`/api/v1/tools/image/remove-background/effects`）](#effects-endpoint-phase-2)（または `remove-background` をパイプラインのステップやバッチジョブとして実行する場合）で適用されます。これらのフィールドをフェーズ 1 に渡すと 400 が返ります。

| パラメーター | 型 | 必須 | デフォルト | 説明 |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | 画像ファイル（マルチパート） |
| model | string | No | - | 使用する AI モデルのバリアント |
| edgeRefine | integer | No | - | エッジの精細化レベル（0～3） |
| decontaminate | boolean | No | - | エッジの色にじみを除去する |

## リクエスト例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/remove-background \
  -F "file=@photo.jpg" \
  -F 'settings={"model":"birefnet-portrait","edgeRefine":2,"decontaminate":true}'
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
data: {"phase":"processing","stage":"Removing background...","percent":50}
```

### 最終結果（SSE 経由） {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_mask.png",
    "maskUrl": "/api/v1/download/{jobId}/photo_mask.png",
    "originalSize": 245000,
    "processedSize": 180000,
    "filename": "photo.jpg",
    "model": "rembg"
  }
}
```

## エフェクトエンドポイント（フェーズ 2） {#effects-endpoint-phase-2}

`POST /api/v1/tools/image/remove-background/effects`

AI モデルを再実行せずに背景エフェクトを再適用します。フェーズ 1 のキャッシュされたマスクと元画像を使用します。

### パラメーター {#parameters-1}

| パラメーター | 型 | 必須 | デフォルト | 説明 |
|-----------|------|----------|---------|-------------|
| settings | JSON | Yes | - | エフェクト設定を含む JSON（下記参照） |
| backgroundImage | file | `backgroundType` が `image` の場合に必須 | - | カスタム背景画像 |

#### settings JSON のフィールド {#settings-json-fields}

| フィールド | 型 | 必須 | デフォルト | 説明 |
|-------|------|----------|---------|-------------|
| jobId | string | Yes | - | フェーズ 1 のジョブ ID |
| filename | string | Yes | - | フェーズ 1 の元のファイル名 |
| backgroundType | string | No | `"transparent"` | 次のいずれか: `transparent`, `color`, `gradient`, `blur`, `image` |
| backgroundColor | string | `backgroundType` が `color` の場合に必須 | - | 16 進カラー: `#RRGGBB` または `#RGB`（`#` は任意） |
| gradientColor1 | string | `backgroundType` が `gradient` の場合に必須 | - | グラデーションの 1 色目。`backgroundColor` と同様の 16 進カラー |
| gradientColor2 | string | `backgroundType` が `gradient` の場合に必須 | - | グラデーションの 2 色目。`backgroundColor` と同様の 16 進カラー |
| gradientAngle | number | No | - | グラデーションの角度（度） |
| blurEnabled | boolean | No | - | 被写体の後ろの元の背景をぼかす（`backgroundType: "blur"` を指定すると暗黙的に有効） |
| blurIntensity | number | No | - | ぼかしの強度（0～100） |
| shadowEnabled | boolean | No | - | 被写体にドロップシャドウを有効にする |
| shadowOpacity | number | No | `35` | 影の不透明度（0～100）。`shadowEnabled` が true の場合に使用 |
| outputFormat | string | No | `"png"` | 出力フォーマット: `png`, `webp`, または `avif` |

### リクエスト例 {#example-request-1}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/remove-background/effects \
  -F 'settings={"jobId":"a1b2c3d4-...","filename":"photo.jpg","backgroundType":"color","backgroundColor":"#FF5500","outputFormat":"png"}'
```

### レスポンス（200 OK） {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/photo_nobg.png",
  "processedSize": 195000
}
```

#### エラー: 背景除去の有効期限切れ（410） {#error-background-removal-expired-410}

effects エンドポイントは、フェーズ 1 が `jobId` に対して保存したマスクと元画像から処理を行います。保存された出力は一定時間後に削除されるため、2 つの呼び出しの間に時間が空きすぎると失われます。同じ画像でフェーズ 1 を再度実行し、返された `jobId` を使用してください。

```json
{
  "error": "This image's background removal has expired. Remove the background again.",
  "code": "BACKGROUND_REMOVAL_EXPIRED"
}
```

保存されたファイルを特定できない `jobId` または `filename`（パス区切り文字、`..`、空文字列）には 400 を返します。

## 注意事項 {#notes}

- `background-removal` モデルバンドル（4～5 GB）のインストールが必要です。
- フェーズ 1 は透明マスクと元画像をキャッシュするため、フェーズ 2（エフェクト）では AI モデルを再実行せずに、異なる背景を即座に再適用できます。
- HEIC/HEIF、RAW、TGA、PSD、EXR、HDR の入力フォーマットを自動デコードでサポートします。
- 処理前に EXIF の回転が自動補正されます。
