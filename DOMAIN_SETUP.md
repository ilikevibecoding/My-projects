## ehpurple.com setup

This repo now includes:

- `.github/workflows/deploy-pages.yml`
- `CNAME`

### GitHub settings

In GitHub for this repository:

1. Open **Settings -> Pages**
2. Set **Source** to **GitHub Actions**
3. Save

### DNS records for ehpurple.com

At your domain provider, point the apex domain to GitHub Pages with these A records:

- `185.199.108.153`
- `185.199.109.153`
- `185.199.110.153`
- `185.199.111.153`

Optional for `www`:

- create a `CNAME` record from `www` to `ilikevibecoding.github.io`

### Branch behavior

This workflow deploys when changes are pushed to:

- `cursor/virtual-phone-gift-6027`

Once DNS has propagated and GitHub Pages is enabled, the site should resolve at:

- `https://ehpurple.com`
