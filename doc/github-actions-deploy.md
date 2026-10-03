# GitHub Actions 部署

本项目仅使用 GitHub Actions 部署 Cloudflare Worker。请关闭 Cloudflare Pages 的 Git 自动部署，避免两个部署系统使用不同的运行时变量。

## 一次性准备

在 Cloudflare 中预先创建并记录：

- D1 数据库的 UUID
- KV namespace 的 32 位 ID
- 可选的 R2 bucket

## GitHub 配置

在仓库的 `Settings → Secrets and variables → Actions` 中配置：

### Secrets

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
JWT_SECRET
D1_DATABASE_ID
KV_NAMESPACE_ID
R2_BUCKET_NAME            # 可选
CUSTOM_DOMAIN             # 可选
```

### Variables

```text
NAME=cloud-mail
DOMAIN=["example.com"]
ADMIN=admin@example.com
PROJECT_LINK=false        # 可选
AI_MODEL=@cf/meta/llama-3.1-8b-instruct-fast  # 可选
ANALYSIS_CACHE=false      # 可选
CLOUDFLARE_EMAIL=false    # 可选
```

`KV_NAMESPACE_ID` 必须是 KV 的 ID，而不是 namespace 名称；`D1_DATABASE_ID` 必须是 D1 UUID，而不是数据库名称。日常部署不会创建或修改这些基础设施资源。

## 部署

推送到 `main` 分支，或在 GitHub Actions 手动运行 `Deploy cloud-mail to Cloudflare Workers`。

首次部署成功后，Workflow 会通过 `POST /api/init` 初始化数据库，并使用 `X-Initialization-Token` 请求头传递初始化凭证。

Resend Token 不属于 GitHub Secret。部署完成后，以管理员身份登录系统，在系统设置中按发信域名配置一个或多个 Resend Token。
