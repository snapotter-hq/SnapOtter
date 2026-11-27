---
description: "開始時刻と終了時刻を指定して動画からクリップを切り出します。"
i18n_source_hash: 0385b4e963d0
i18n_provenance: machine
i18n_output_hash: becd3750f8d3
i18n_hash_version: 2
---

# Trim Video {#trim-video}

動画からクリップを切り出します。開始時刻と終了時刻の間の部分を残すか、先頭と末尾から一定の長さを切り落とすかを選べます。フレーム単位で正確に切り出すオプションもあります。

アプリでは、時刻フィールドに秒数のみ (`90`)、`MM:SS` (`1:30`)、または `HH:MM:SS` (`1:02:03.5`) を入力できます。API は秒数を受け付けます。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/trim-video`

動画ファイルと JSON の `settings` フィールドを含む multipart フォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `range` | `range` は `startS` から `endS` までを残します。`ends` は先頭から `cutStartS`、末尾から `cutEndS` を取り除きます |
| startS | number | No | `0` | Range mode: 開始時刻（秒単位、0 以上である必要があります） |
| endS | number | Range mode | - | Range mode: 終了時刻（秒単位、startS より後である必要があります） |
| cutStartS | number | No | `0` | Ends mode: 先頭から取り除く秒数 |
| cutEndS | number | No | `0` | Ends mode: 末尾から取り除く秒数 |
| precise | boolean | No | `false` | 次のキーフレームからコピーする代わりに、範囲全体を再エンコードして開始フレームと終了フレームを正確にします |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/trim-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"startS": 5, "endS": 30, "precise": true}'
```

動画の長さに関係なく、最初の 5 秒と最後の 10 秒を切り落とします。

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/trim-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"mode": "ends", "cutStartS": 5, "cutEndS": 10}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 4200000
}
```

## Notes {#notes}

- `precise` が `false`（デフォルト）の場合、クリップは指定したフレームちょうどから始まります。その開始位置から次のキーフレームまでのフレームだけが再エンコードされ、残りはコピーされるため、高速なままです。コピーされたストリームは前のフレームが参照するフレームを保持するため、終了位置は 1 フレームほど長くなることがあります。安全に結合できないソース（10 ビットまたはインターレースの H.264、再エンコードされた開始位置が必要なその他のコーデック、AVI、FLV、MPEG、TS ファイル）は、代わりに全体が再エンコードされます。
- `precise` を `true` に設定すると、常に範囲全体が再エンコードされるため、両端が正確になりますが、時間が長くかかります。
- Range mode では、`endS` は `startS` より大きい必要があります。`endS` が動画の終わりを超えている場合、クリップは最後まで続きます。
- Ends mode では、`cutStartS` と `cutEndS` の少なくとも一方が 0 より大きく、かつ合計で動画の一部が残る必要があります。切り出しは各ファイル自身の長さを基準に測るため、長さの異なる動画のバッチでも 1 つの設定で処理できます。
