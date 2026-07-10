---
description: "複数の音声ファイルを 1 つの連続したトラックに結合します。"
i18n_source_hash: defa993d3f87
i18n_provenance: human
i18n_output_hash: 1f52fbf69f94
---

# 音声を結合 {#merge-audio}

2 つ以上の音声ファイルを、アップロードされた順に連結して 1 つの連続したトラックに結合します。

## API エンドポイント {#api-endpoint}

`POST /api/v1/tools/audio/merge-audio`

複数の音声ファイルと JSON の `settings` フィールドを含むマルチパートフォームデータを受け付けます。

## パラメータ {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp3"` | 出力形式: `mp3`、`wav`、`flac`、`m4a` |

## リクエスト例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/merge-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@intro.mp3" \
  -F "file=@main.mp3" \
  -F "file=@outro.mp3" \
  -F 'settings={"format": "mp3"}'
```

## レスポンス例 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.mp3",
  "originalSize": 9500000,
  "processedSize": 9200000
}
```

## 注意事項 {#notes}

- 1 リクエストにつき 2〜10 個の音声ファイルを受け付けます。
- ファイルはアップロード順に連結されます。
- すべての入力ファイルは、シームレスな結合のために選択した出力形式とサンプルレートに再エンコードされます。
- 混在した入力形式がサポートされます（例: WAV 1 つと MP3 1 つ）。
