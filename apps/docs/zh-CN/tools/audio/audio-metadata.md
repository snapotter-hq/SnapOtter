---
description: "查看、编辑或剥除音频元数据标签（ID3）。"
i18n_source_hash: 0717018e11cb
i18n_provenance: human
i18n_output_hash: d5d75b73e81f
---

# 音频元数据 {#audio-metadata}

查看、编辑或剥除音频元数据标签，如标题、艺术家和专辑（ID3 及类似标签格式）。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/audio/audio-metadata`

接受包含一个音频文件和一个 JSON `settings` 字段的 multipart 表单数据。

## 参数 {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| strip | boolean | No | `false` | 移除所有现有的元数据标签 |
| title | string | No | - | 设置标题标签（最多 500 个字符） |
| artist | string | No | - | 设置艺术家标签（最多 500 个字符） |
| album | string | No | - | 设置专辑标签（最多 500 个字符） |

## 请求示例 {#example-request}

编辑元数据标签：

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"title": "My Song", "artist": "Artist Name", "album": "Album Name"}'
```

剥除所有元数据：

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"strip": true}'
```

## 响应示例 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4480000,
  "metadata": {
    "container": "mp3",
    "durationS": 245.3,
    "bitrateKbps": 192,
    "tags": {
      "title": "My Song",
      "artist": "Artist Name",
      "album": "Album Name"
    }
  }
}
```

## 说明 {#notes}

- 响应包含一个 `metadata` 对象，其中含有容器格式、时长、比特率和当前标签。
- 当 `strip` 为 `true` 时，所有标签字段都会被忽略，且每个现有标签都会被移除。
- 只有你提供的标签会被更新；未指定的标签保持不变。
- 输出格式与输入格式一致。
