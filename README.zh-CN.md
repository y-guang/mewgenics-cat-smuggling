# Mewgenics 猫猫发来！

把一只猫从一个 Mewgenics 存档送到另一个存档里，不用让朋友直接碰原始存档数据。

## 我能干什么？

1. 打开[我们的网页工具](https://y-guang.github.io/mewgenics-cat-smuggling/)。
2. 从你的存档里生成一张猫猫分享图。
3. 把这张图片发给朋友，或者直接发到网上。
4. 你的朋友把图片拖进 `Import`，然后导出一个已经加入猫猫的新存档。

English README: [README.md](README.md)

## 这是什么

Mewgenics 的猫猫值得被分享，不该被困在单个存档里。

这个项目把猫猫转移整理成一个更友好的流程：

- 选择一只猫
- 生成分享图
- 发给朋友
- 朋友把图片拖进导入器
- 工具生成一个已经加入猫猫的新 `.sav` 文件

目标很直接：让“分享猫猫”更像游戏功能，而不是一次折腾人的改存档流程。

## 功能亮点

- 基于 Vue 3、Vite、Pinia 的前端工作流
- 面向普通玩家设计的导入/导出流程，不只是给逆向玩家用
- 导出 PNG 分享图，并在 PNG 元数据中嵌入完整 payload，恢复更稳
- 同时保留盲水印短 key 作为回退路径
- 支持英文和中文界面
- 在界面里直接提供 Windows 存档路径，方便快速打开

## 分享机制

猫猫转移主要有两条路：

1. 分享图
   应用会导出一张 PNG 分享图，并把完整猫猫 payload 写进 PNG 元数据里。只要元数据还在，导入时可以直接从图片恢复猫猫，不需要联网。

2. 短链接回退
   图片里还带有一个短 watermark key。如果 PNG 元数据丢失或损坏，导入器仍然可以回退到短链接查询流程。

此外还有一个更适合长期存档使用的长链接。

## 部署（如果你希望自托管一个工具）

### 环境要求

- Node.js 20+
- npm

### 启动前端

```bash
npm install
npm run dev
```

### 可选：短链接后端

前端本身可以独立运行，但短链接的创建和解析依赖后端服务。

后端说明见：[backend/README.md](backend/README.md)

## 玩家使用流程

### 导出猫猫

1. 打开源 `.sav` 存档。
2. 选择想分享的猫猫。
3. 可选上传一张封面图作为分享图封面。
4. 下载生成的 PNG 分享图，或者复制链接。

### 导入猫猫

1. 将分享图拖入导入器，或者直接打开导入链接。
2. 选择目标 `.sav` 存档。
3. 按需要调整年龄和状态。
4. 导出更新后的新存档。

## Windows 存档位置

常见路径：

```text
%APPDATA%\Glaiel Games\Mewgenics\<Steam ID>\saves\
```

应用里的上传界面也会直接显示这条路径，方便用户复制粘贴。

## 分享服务配置

短链接后端地址配置位于 [src/config/share.ts](src/config/share.ts)。

可用环境变量：

- `VITE_SHORT_URL_API_BASE`
- `VITE_SHORT_URL_API_BASE_DEV`
- `VITE_SHORT_URL_API_BASE_PROD`

解析顺序：

1. `VITE_SHORT_URL_API_BASE`
2. 开发环境回退到 `VITE_SHORT_URL_API_BASE_DEV` 或 `http://127.0.0.1:8787`
3. 生产环境回退到 `VITE_SHORT_URL_API_BASE_PROD` 或 `https://mewgenics-cat-smuggling-api.yangguang.dev`

## 致谢

本项目建立在以下工作基础上：

- [mewgenics-savegame-editor](https://github.com/michael-trinity/mewgenics-savegame-editor)

盲水印能力改编自：

- [blind_watermark](https://github.com/guofei9987/blind_watermark)

## 已知问题

- 新猫咪自己没有家族树。
- 老死的机制和岁数似乎独立。因此即使修改老猫为年轻的，似乎它也会在早年间死去。
