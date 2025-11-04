# 🚀 Deploy to Vercel - Step by Step Guide

## Prerequisites ✅
- GitHub account (free)
- Vercel account (free at vercel.com)

## Step 1: Push to GitHub

### Option A: Using GitHub Desktop (Easiest)
1. Download GitHub Desktop if you don't have it
2. Open GitHub Desktop
3. Click "File" → "Add Local Repository"
4. Navigate to `D:\cursor Projects\scdiary`
5. Click "Publish repository" 
6. Name it `scdiary` (or your preferred name)
7. Make sure "Keep this code private" is UNCHECKED (or checked if you want it private)
8. Click "Publish Repository"

### Option B: Using Command Line (If you have GitHub CLI)
```bash
cd "D:\cursor Projects\scdiary"
gh repo create scdiary --public --source=. --remote=origin --push
```

### Option C: Manual GitHub Setup
1. Go to github.com and sign in
2. Click the "+" icon → "New repository"
3. Name it: `scdiary`
4. Choose Public or Private
5. **DO NOT** initialize with README (we already have files)
6. Click "Create repository"
7. Then run these commands:

```bash
cd "D:\cursor Projects\scdiary"
git remote add origin https://github.com/YOUR_USERNAME/scdiary.git
git branch -M main
git push -u origin main
```

**Replace `YOUR_USERNAME` with your actual GitHub username!**

---

## Step 2: Deploy on Vercel

1. Go to **[vercel.com](https://vercel.com)** and sign in (use GitHub to sign in)

2. Click **"Add New Project"** (or "New Project")

3. **Import your repository:**
   - Find `scdiary` in the list
   - Click **"Import"**

4. **Configure Project:**
   - **Framework Preset:** Leave as "Other" or "No Framework"
   - **Root Directory:** `./` (default - leave empty)
   - **Build Command:** Leave empty (not needed)
   - **Output Directory:** Leave empty
   - **Install Command:** `npm install` (should be auto-detected)

5. **Environment Variables** - Click "Environment Variables" and add these:

   | Variable Name | Value | Description |
   |--------------|-------|-------------|
   | `ADMIN_PASSWORD` | `your_secure_password_here` | Your admin panel password (choose a strong one!) |
   | `SESSION_SECRET` | `[generate_random_string]` | Random string for session encryption (see below) |
   | `NODE_ENV` | `production` | Production environment flag |

   **To generate SESSION_SECRET, run this command:**
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   Copy the output and use it as the value for `SESSION_SECRET`

6. Click **"Deploy"** and wait 1-2 minutes

---

## Step 3: Test Your Deployment

Once deployed, Vercel will give you a URL like:
- `https://scdiary.vercel.app` (or similar)

**Test these:**
1. ✅ Main diary page loads
2. ✅ Admin panel: `https://your-url.vercel.app/admin`
3. ✅ Login with your password
4. ✅ Create a test entry
5. ✅ Delete an entry
6. ✅ Theme toggle works

---

## ⚠️ Important Notes

### File Storage Limitation
**Important:** Vercel's serverless functions have a read-only filesystem. Your `entries.json` file will **NOT persist** across deployments or function restarts.

**This means:**
- Entries will work during a session
- Entries may disappear after deployment updates
- Entries won't persist between serverless function restarts

### Solutions (for later):
1. **Add MongoDB** (recommended) - I can help you add this
2. **Use Vercel Postgres** - Integrated with Vercel
3. **Use Supabase** - Free PostgreSQL database
4. **Use Vercel KV** - Redis-based storage

**For now:** The site will work, but entries may not persist long-term. This is fine for testing!

---

## Step 4: Custom Domain (Optional)

If you want a custom domain:
1. Go to your project settings in Vercel
2. Click "Domains"
3. Add your domain
4. Follow Vercel's DNS instructions

---

## Troubleshooting

**Build fails?**
- Check that all dependencies are in `package.json` ✅
- Make sure `vercel.json` is correct ✅

**Routes not working?**
- Check `vercel.json` routes configuration ✅

**Login not working?**
- Make sure `ADMIN_PASSWORD` is set correctly
- Make sure `SESSION_SECRET` is set

**Entries disappearing?**
- This is expected with file storage - need database solution

---

## Next Steps

Once deployed and tested, we can:
1. Add database support (MongoDB/PostgreSQL)
2. Set up custom domain
3. Add analytics
4. Optimize performance

---

**Need help?** Let me know if you get stuck at any step!

