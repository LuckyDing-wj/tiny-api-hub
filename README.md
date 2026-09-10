# Tiny API Hub

浏览器扩展：New API 中转账号 + API 凭据精简管家。从 [all-api-hub](https://github.com/qixing-jk/all-api-hub) 派生，独立新仓，不裁旧仓。

## 功能

- **账号管理**：手动添加 / 导入当前标签页（自动识别 New API 登录态，拿 PAT）
- **密钥管理**：列表 / 新建 / 复制真 Key / 删除 / 改分组 / 查看分组可用模型
- **模型列表 + 价格**：按账号查看模型和定价（复用旧仓价格算法）
- **签到**：主页一键批量串行签到，卡片上显示进度和历史状态
- **凭据库**：Base URL + API Key CRUD + 测连通
- **验证**：`/v1/models` 全列表 + 批量串行文本生成探测（30s 超时，限速防封）
- **导出**：CC Switch deeplink（claude / codex / gemini 等）
- **备份**：本地 JSON 导入导出（合并 / 替换）+ WebDAV 手动上传下载（AES-GCM 加密信封）

## 技术栈

- WXT 0.20 + React 19 + TypeScript
- Tailwind CSS v4
- chrome.storage.local + chrome.scripting

## 本机使用

```bash
pnpm install
node node_modules/wxt/bin/wxt.mjs build
```

Chrome → `chrome://extensions` → 开发者模式 → 加载 `D:\Code\projects\tiny-api-hub\.output\chrome-mv3`。

开发时热重载：`node node_modules/wxt/bin/wxt.mjs`（不要用 `pnpm dev`，会撞 supply-chain 策略）。

## 范围

- **仅 New API 站点**。不做 One API / Veloera / Done Hub / Sub2API / OpenRouter 等
- 不上架、不申请商店扩展 ID
- 不做 Safari / 移动端
- 不做网关管理、用量图表、公告、赞助、产品分析

需求详见 [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md)。

## 致谢

本项目参考了 [all-api-hub](https://github.com/qixing-jk/all-api-hub)（作者 [qixing-jk](https://github.com/qixing-jk)）的 New API 协议层、价格算法和部分交互设计。旧仓只读参考，未拷贝其文件，未修改其代码。

## 开源协议

[GNU Affero General Public License v3.0](LICENSE)

沿用上游 all-api-hub 的 AGPL-3.0 协议。任何基于本项目的衍生作品须保持同一协议并开源。
