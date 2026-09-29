# dsh-plugin-fact-vault

DeepSeek Harness (dsh) 插件：**跨会话事实便签库**。一句话一条，打标签，之后的任何会话都能按关键词召回——人用 `/fact`，模型自己用 `fact_find` 工具。

适合回答："上周我在这个 harness 里定过的口径是什么？"——transcript 记录"发生过什么"，fact-vault 存"结论是什么"。

同系列：[transcript](https://github.com/121212165/dsh-plugin-transcript) · [transcript-search](https://github.com/121212165/dsh-plugin-transcript-search)（全文检索原始转录）· [pinboard](https://github.com/121212165/dsh-plugin-pinboard)（无条件注入系统提示）。区别：本库是**按需召回**，不占系统提示预算。

## 用法

- **`/fact save <文本[#标签]>`**：记一条。`#` 后的部分按 `#` 分割成多个标签，一条可带多标签。
- **`/fact find <关键词>`**：空格分词，标签命中记 3 分、正文命中记 1 分，同分按时间倒序（新先出）。
- **`/fact list`**：最近 20 条。
- **`/fact rm <id>`**：删除。
- **`fact_find` 工具**：同 find，供模型在回答"之前说过/定过什么"时自己调用。

存储为单个 JSONL（默认 `~/.dsh/fact-vault/facts.jsonl`），每行 `{v:1,id,text,tags,at}`。

## 与其它插件的边界

- 写库是本插件自己的事：读时容错（坏行跳过并计数），**永不改写源文件中损坏的行**。
- id 是自增数字字符串（`max(已存 id)+1`），不是哈希，便于 `/fact rm 3` 这种手敲。

## 配置

| 字段 | 默认 | 说明 |
|---|---|---|
| `enabled` | `true` | |
| `libraryPath` | `~/.dsh/fact-vault/facts.jsonl` | 库文件路径 |
| `limit` | `10` | find / fact_find 最多返回几条 |

## 安装

`npm i dsh-plugin-fact-vault`；或克隆后 `npm install`（`prepare` 构建 `lib/`）再链进 profile 的 node_modules。挂载片段见 `cordis.patch.yml`。

## 验证状态

- 纯函数（解析容错、打分排序、id 自增、渲染）5 个 `node --test` 全绿。
- 本机 live 验证：headless 会话中模型真实调用 `fact_find`；`save→find→list→rm` 生命周期在临时库上跑通，非法动词返回 `error` 而不抛异常。
- 未验证：`/fact` 在 web UI 里的手动输入体验（headless 无输入通道）。
