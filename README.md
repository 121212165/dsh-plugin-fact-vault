# dsh-plugin-fact-vault

> 🧩 **dsh 插件家族**（22 件）：总目录 **[dsh-plugin-family](https://github.com/121212165/dsh-plugin-family)** ｜ 明星插件：**[ide-hub](https://github.com/121212165/dsh-plugin-ide-hub)** 跨 IDE 统一管理 · **[task-forge](https://github.com/121212165/dsh-plugin-task-forge)** 跨窗口无损交接 · **[quota](https://github.com/121212165/dsh-plugin-quota)** 实时用量仪表


**EN** · Cross-session fact notepad: `/fact save` records a decision with tags, `/fact find` ranks recall by keyword, and the model can call `fact_find` itself — so what one window learned, the next can retrieve. · 5 `node --test` green · live headless sessions proved the model calling `fact_find` and the full save→find→list→rm cycle on a temp store.

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

三步，实测于 `@deepseek-ai/dsh@0.1.7-alpha.1`（需 `pnpm` 在 PATH 上）：

```sh
# ① 装进 profile：dsh plugin 把参数原样转发给 pnpm，git 包会自动跑 prepare 构建 lib/
dsh plugin --profile web add github:121212165/dsh-plugin-fact-vault
```

② 把本仓库根目录 `cordis.patch.yml` 的内容**并进** `$DSH_HOME/profiles/web/cordis.patch.yml`。
该文件默认是 `[]`，所以要么整份替换，要么把 insert 条目并进同一个数组；**不要直接追加**——
追加会形成两个 YAML 文档，启动即报
`failed to parse overlay ... end of the stream or a document separator is expected`（本机实测踩过）。

③ 重启 dsh。配置层与 client 半都要重启才生效（客户端按 boot 时算出的内容 rev 下发，硬刷新浏览器没用）。

自检挂载：`dsh --profile web --dump-config | grep dsh-plugin-fact-vault`，应看到该条目。
## 验证状态

- 纯函数（解析容错、打分排序、id 自增、渲染）5 个 `node --test` 全绿。
- 本机 live 验证：headless 会话中模型真实调用 `fact_find`；`save→find→list→rm` 生命周期在临时库上跑通，非法动词返回 `error` 而不抛异常。
- 未验证：`/fact` 在 web UI 里的手动输入体验（headless 无输入通道）。
