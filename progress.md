# Progress Log

## 2026-10-03

- 完成项目静态分析。
- 与用户确认所有对象私有化，旧公开 URL 不兼容。
- 设计文档已获用户确认并提交：`cc05da3`。
- 创建实施计划、发现记录和进度文件。
- 完成 Phase 1A：新增鉴权对象接口，移除公开 `/attachments`、`/static`、`/oss` 读取，前端附件/图片/背景改为鉴权 Blob 加载。
- 完成 Phase 1B：参数绑定修复批量创建用户 SQL，会话增加 JWT exp 和 KV TTL，校验 JWT header/payload。
- 完成 Phase 1C：邮件 HTML 清洗，增加对象 URL 处理和登录/注册/公开 API/OAuth 限流。
- 完成 Phase 1D：初始化接口改为 POST + `X-Initialization-Token`，CI 调用同步更新，错误响应不再泄露内部异常。
- 完成 Phase 2A：恢复 Vitest 测试脚本，新增测试 Wrangler 配置。
- 完成 Phase 2B：新增 JWT、限流、未认证对象访问测试。
- 完成 Phase 2C：CI 增加后端测试与前端构建步骤。
- 验证通过：后端 4 个测试通过；前端 release 构建通过；后端所有 JS `node --check` 通过。
- 构建警告：Vite 提示 `NODE_ENV=release` 不推荐；存在大于 500kB chunk；Browserslist 数据过期，未阻断构建。
