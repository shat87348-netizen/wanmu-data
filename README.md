# 数据处理平台前端

基于 Vue 3、Nuxt、Nuxt UI 与 Tailwind CSS 搭建。

建议使用 Node.js 24 LTS（最低 22.19；也支持 26+）。

## 开发

```bash
npm install --cache .npm-cache
npm run dev
```

启动后访问 `http://localhost:3000`。

## 构建

```bash
npm run build
```
# Cloudflare Pages 自动部署

每次推送 `main` 会部署到生产环境；每个 Pull Request 会创建预览部署。

首次在 Cloudflare 创建 Pages 项目后，在 GitHub 仓库的 **Settings → Secrets and variables → Actions** 配置：

- Secret `CLOUDFLARE_API_TOKEN`：具备 Pages 写入权限的 Cloudflare API Token。
- Secret `CLOUDFLARE_ACCOUNT_ID`：Cloudflare Account ID。
- Secret `NUXT_PUBLIC_API_BASE`：生产环境可访问的后台 API 地址。
- Variable `CLOUDFLARE_PAGES_PROJECT`：Pages 项目名称；不设置时默认 `wanmu-data`。

Cloudflare API Token 仅需授予目标账户的 Pages 写入权限；不要将 Token 或 Account ID 写入代码库。

本地验证 Cloudflare 构建：

```bash
npm run build:cloudflare
```
