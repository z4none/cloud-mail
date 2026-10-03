# Findings

## 已确认架构

- Worker 入口：`mail-worker/src/index.js`。
- Hono 路由通过 `mail-worker/src/hono/webs.js` 的副作用 import 注册。
- 会话由 HS256 JWT + KV `AUTH_INFO` token 白名单组成。
- 对象存储抽象支持 KV、R2、S3，但入口当前对 `/attachments/*`、`/static/*` 固定走 KV 公开读取。
- 前端邮件正文在 `mail-vue/src/components/shadow-html/index.vue` 中直接写入 Shadow DOM `innerHTML`。

## 已确认风险

- `mail-worker/src/service/public-service.js` 138-149 行使用字符串插值 SQL。
- `mail-worker/src/service/login-service.js` 255 行创建 KV TTL，259-264 行注销时未保留 TTL；JWT 生成未传 `exp`。
- `mail-worker/src/service/security` 使用路径前缀匹配，后续需避免新对象路由被错误排除。
- `mail-worker/package.json` 的 `test` 脚本是 Wrangler 部署，不是测试。
- `mail-worker/test/index.spec.js` 仍测试 Hello World。
- `mail-worker/vitest.config.js` 引用缺失的 `wrangler.jsonc`。

## 设计约束

- 对象接口必须兼容 KV/R2/S3。
- 对象归属不能只依赖 URL key；普通附件需要通过附件记录关联 `userId`，背景需要通过 setting 当前值校验，内嵌图片同样基于附件记录校验。
- 浏览器 HTML `<img>` 不能自动带 Authorization，因此前端需要重写 HTML 中资源 URL，并用带 Token 的请求加载 Blob URL。
- 不应直接把用户可控错误信息作为 HTML 返回给前端。
- 部署失败日志显示 `KV namespace 'cloud-mail-test' is not valid`，说明 KV 名称被当作 namespace ID 使用；Workflow 原先只判断非空，不校验 ID 格式。

## 已实施发现

- `/oss` 路由同样是未认证对象读取入口，已移除该路由并删除入口公开 KV 对象读取。
- 登录背景在未认证的登录页无法通过 Authorization 加载，因此公开网站配置不再返回背景 key；登录页无背景是私有化策略的预期结果。
- 邮件正文资源使用 `{{domain}}attachments/...` 占位符，前端清洗后通过 Blob URL 加载。
