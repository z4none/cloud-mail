# Cloud Mail 安全与测试加固实施计划

## 目标

完成已批准设计的两个阶段，并进行第三阶段生产验证：
1. 安全修复：SQL 注入、邮件 HTML XSS、会话过期、私有对象访问、限流、初始化凭证。
2. 测试工程：恢复真实测试命令，补充安全/认证/对象访问测试，并接入 CI 构建检查。

## 阶段

- [complete] Phase 1A：对象访问与前端资源加载改造
- [complete] Phase 1B：SQL 注入、输入校验、会话生命周期
- [complete] Phase 1C：邮件 HTML 清洗与请求限流
- [complete] Phase 1D：初始化凭证与错误处理加固
- [complete] Phase 2A：修复 Vitest/Wrangler 配置与测试脚本
- [complete] Phase 2B：新增后端安全与业务测试
- [complete] Phase 2C：前端构建、CI 校验与最终回归
- [complete] Phase 3A：构建警告与打包优化
- [complete] Phase 3B：本地 Worker/前端生产流程验证
- [complete] Phase 3C：存储兼容性和安全回归测试
- [complete] Phase 4：统一 GitHub Actions 部署并移除基础设施自动创建
- [complete] Phase 5A：线程数据迁移与后端关联逻辑
- [complete] Phase 5B：线程列表与详情 API
- [complete] Phase 5C：收件箱与会话详情界面
- [complete] Phase 5D：线程测试与构建验证
- [complete] Phase 6：会话详情卡片化与双主题视觉优化
- [complete] Phase 6：前端构建验证

## 关键决策

- 所有对象私有：附件、内嵌图片、登录背景、其他上传对象都必须鉴权。
- 不兼容旧公开对象 URL。
- 使用统一受保护对象接口，并校验对象归属。
- 邮件正文通过 sanitizer 清洗；对象 URL 在前端以鉴权 Blob 加载。
- 不记录 Token、密码、初始化凭证或邮件敏感内容。

## 验证命令

- `node --check`：后端 JS 语法
- `pnpm --dir mail-worker test`
- `pnpm --dir mail-vue build`
- 必要时运行 `pnpm exec vitest run` 与 Wrangler Workers 集成测试

## 错误记录

| 错误 | 尝试 | 处理 |
|---|---|---|
| `ERR_PNPM_NO_IMPORTER_MANIFEST_FOUND` | 在仓库根目录运行 `pnpm test` | 根目录没有 package.json，改用 `pnpm --dir mail-worker test` |
| `vitest is not recognized` | `pnpm --dir mail-worker test` | 当前工作区没有安装 node_modules，先安装依赖后重试 |
| `update-browserslist-db` command not found | 直接以 pnpm exec 运行更新器 | 更新器不是项目依赖；保留非阻断警告，避免无关 lockfile 升级 |
| Ruby YAML parser unavailable | 尝试解析 GitHub Actions YAML | 改为执行 Workflow 中的 ID 校验 shell 条件，分别验证有效和无效 KV ID |
