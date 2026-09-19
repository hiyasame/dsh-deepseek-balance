# dsh-deepseek-balance

一个轻量的 dsh 插件，在 dsh 底部状态条展示当前 deepseek 余额

## 效果

![alt text](./image/image.png)

余额药丸与官方的会话统计药丸同排，位于 `对话轮次/步数 · token` 与右侧上下文占用环之间。

## 兼容性

适配 dsh `0.1.6-alpha.2` 的 web 布局：

- 新版的 `conversation.composer.dock` 直接把每个注册项作为 `.uV2eYG_dock`（`InputBar.module.css`）的 flex 子项渲染，同一排还有 `dsh-client-ui-chat` 的统计药丸和 `ContextMeter`。
- 旧版依赖的 `[data-composer-stats]` 挂载点已经不存在。本插件不再做 portal 与 DOM 轮询，而是像官方药丸一样返回一个按内容收缩的 `inline-flex` 药丸；否则 `width:100%` 的行容器会独占这一排，把官方的轮次/token 文字挤成省略号（`5 轮 2…`、`393K to…`）。

## License

MIT
