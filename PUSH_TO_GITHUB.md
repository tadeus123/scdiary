# Push Code to GitHub - Quick Guide

## Option 1: GitHub Desktop (Easiest - Recommended)

1. **Download GitHub Desktop** (if you don't have it): https://desktop.github.com/
2. **Open GitHub Desktop**
3. **File → Add Local Repository**
4. **Navigate to:** `D:\cursor Projects\scdiary`
5. **Click "Add"**
6. **Click "Publish repository"** (top right)
   - Make sure repository name is: `scdiary`
   - Owner: `tadeus123`
   - Make sure "Keep this code private" is **UNCHECKED** (since it's public)
7. **Click "Publish Repository"**

Done! ✅ Your code will be pushed automatically.

---

## Option 2: Command Line with Personal Access Token

1. **Create a Personal Access Token:**
   - Go to: https://github.com/settings/tokens
   - Click "Generate new token" → "Generate new token (classic)"
   - Name it: `scdiary-push`
   - Select scope: ✅ **repo** (all checkboxes under repo)
   - Click "Generate token"
   - **COPY THE TOKEN** (you won't see it again!)

2. **Push using the token:**
   ```powershell
   cd "D:\cursor Projects\scdiary"
   git remote set-url origin https://YOUR_TOKEN@github.com/tadeus123/scdiary.git
   git push -u origin main
   ```
   Replace `YOUR_TOKEN` with the token you copied.

---

## Option 3: Use SSH (if you have SSH keys set up)

```powershell
cd "D:\cursor Projects\scdiary"
git remote set-url origin git@github.com:tadeus123/scdiary.git
git push -u origin main
```

---

**After pushing, come back and I'll help you set up Vercel!** 🚀

