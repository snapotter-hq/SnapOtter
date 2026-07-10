---
description: "画像からチャンネルごとの統計を含む RGB ヒストグラムチャートを生成します。"
i18n_source_hash: 57aa610206a5
i18n_provenance: human
i18n_output_hash: 442857dea9f1
---

# ヒストグラム {#histogram}

画像から RGB ヒストグラムチャートを生成します。PNG ヒストグラム画像を、チャンネルごとの統計と生の 256 ビンヒストグラムデータとともにレスポンス JSON で返します。

## API エンドポイント {#api-endpoint}

`POST /api/v1/tools/image/histogram`

画像ファイルと JSON `settings` フィールドを含む multipart フォームデータを受け付けます。

## パラメーター {#parameters}

| パラメーター | 型 | 必須 | デフォルト | 説明 |
|-----------|------|----------|---------|-------------|
| scale | string | いいえ | `"linear"` | Y 軸のスケール: `linear` または `log` |

## リクエスト例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/histogram \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"scale": "linear"}'
```

## レスポンス例 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/histogram.png",
  "originalSize": 2450000,
  "processedSize": 12000,
  "bins": {
    "r": [0, 12, 45, "... (256 values)"],
    "g": [0, 8, 38, "... (256 values)"],
    "b": [2, 15, 52, "... (256 values)"],
    "lum": [0, 10, 40, "... (256 values)"]
  },
  "stats": {
    "r": { "mean": 128, "median": 132, "stdev": 48.5 },
    "g": { "mean": 119, "median": 121, "stdev": 44.2 },
    "b": { "mean": 105, "median": 108, "stdev": 51.3 },
    "lum": { "mean": 118, "median": 120, "stdev": 45.1 }
  },
  "mean": { "r": 128, "g": 119, "b": 105 },
  "max": { "r": 4200, "g": 3800, "b": 4100 }
}
```

## 注記 {#notes}

- `downloadUrl` は、R、G、B、および輝度の分布を示すレンダリング済みの PNG ヒストグラムチャートを指します。
- `bins` には、各チャンネル（赤、緑、青、輝度）の生の 256 値配列が含まれており、カスタムビジュアライゼーションのレンダリングに適しています。
- `stats` は、チャンネルごとの平均値、中央値、標準偏差を提供します。
- `mean` と `max` は、後方互換性のための省略フィールドです。
- ヒストグラムがいくつかのピークに支配されていて、下位ビンの詳細を見たい場合は `log` スケールを使用します。
- HEIC、RAW、PSD、SVG 入力は、分析前に自動的にデコードされます。
