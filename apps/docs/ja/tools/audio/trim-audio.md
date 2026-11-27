---
description: "開始時刻と終了時刻を指定して、音声ファイルの一部を切り出します。"
i18n_source_hash: f8d0b6a84592
i18n_provenance: machine
i18n_output_hash: ea59d87f9b0f
i18n_hash_version: 2
---

# Trim Audio {#trim-audio}

音声ファイルの一部を切り出します。開始時刻と終了時刻の間の部分を残すか、先頭と末尾から決まった長さを削除できます。

アプリでは、時刻フィールドに秒の数値（`90`）、`MM:SS`（`1:30`）、または `HH:MM:SS`（`1:02:03.5`）を入力できます。API は秒で指定します。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/trim-audio`

音声ファイルと JSON `settings` フィールドを含む multipart フォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `range` | `range` は `startS` から `endS` までを残します。`ends` は先頭から `cutStartS`、末尾から `cutEndS` を削除します |
| startS | number | No | `0` | range モード: 開始時刻（秒、最小 0） |
| endS | number | Range mode | - | range モード: 終了時刻（秒、開始時刻より後である必要があります） |
| cutStartS | number | No | `0` | ends モード: 先頭から削除する秒数 |
| cutEndS | number | No | `0` | ends モード: 末尾から削除する秒数 |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/trim-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"startS": 10, "endS": 45}'
```

ファイルの長さに関係なく、最初の 2 秒と最後の 3 秒を切り落とす例:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/trim-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "ends", "cutStartS": 2, "cutEndS": 3}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 1575000
}
```

## Notes {#notes}

- 時刻は秒で指定し、小数を含めることができます（例: `10.5`）。
- range モードでは、`endS` が `startS` より大きい必要があります。`endS` が音声の長さを超える場合、ファイルは末尾まで切り出されます。
- ends モードでは、`cutStartS` と `cutEndS` の少なくとも一方が 0 より大きく、合計しても 0.1 秒以上の音声が残る必要があります。切り落とす長さは各ファイル自身の長さを基準に計算されるため、長さの異なる複数のファイルに対して 1 つの設定でバッチ処理できます。
- 出力は通常、入力コンテナを維持します。AAC 入力は M4A として書き出され、デコード専用でサポートされない入力は MP3 にフォールバックします。
