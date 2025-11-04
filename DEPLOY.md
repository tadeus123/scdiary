# Deploying to Vercel

## Quick Deploy Steps

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit - digital diary"
git remote add origin <your-github-repo-url>
git push -u origin main
```

### 2. Deploy on Vercel

1. Go to [vercel.com](https://vercel.com) and sign in
2. Click **"Add New Project"**
3. Import your GitHub repository
4. Configure the project:
   - **Framework Preset**: Other
   - **Root Directory**: `./` (default)
   - **Build Command**: Leave empty (not needed)
   - **Output Directory**: Leave empty

### 3. Set Environment Variables

In Vercel project settings, go to **Settings → Environment Variables** and add:

| Variable Name | Value | Description |
|---------------|-------|-------------|
| `ADMIN_PASSWORD` | `your_secure_password_here` | Your admin panel password |
| `SESSION_SECRET` | `generate_random_string_here` | Random string for session encryption |
| `NODE_ENV` | `production` | Production environment flag |

**Generate a secure SESSION_SECRET:**
```bash
# Run this command to generate a random string:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 4. Deploy!

Click **"Deploy"** and wait for the build to complete.

## Important Notes

### File Storage Limitation

⚠️ **Important**: Vercel's filesystem is read-only (except `/tmp`). Your `entries.json` file will **NOT persist** across deployments or serverless function restarts.

**Solutions:**
1. **Use a database** (recommended):
   - MongoDB Atlas (free tier available)
   - PostgreSQL (Vercel Postgres)
   - Supabase (free tier)

2. **Use Vercel KV** (Redis) for simple key-value storage

3. **Use an external storage service**:
   - AWS S3
   - Google Cloud Storage

### Quick Fix: Use Environment Variable Storage

For a quick workaround, you could store entries in an environment variable, but this has limitations (32KB max).

### Recommended: Add Database Support

I can help you add MongoDB or PostgreSQL support if you'd like. Just let me know!

## After Deployment

1. Your diary will be live at: `https://your-project.vercel.app`
2. Admin panel: `https://your-project.vercel.app/admin`
3. Set a strong password in environment variables before first use!

## Troubleshooting

- **Build fails**: Make sure all dependencies are in `package.json`
- **Routes not working**: Check `vercel.json` configuration
- **Session not persisting**: Make sure `SESSION_SECRET` is set
- **Entries disappearing**: This is expected with file storage - need database solution

