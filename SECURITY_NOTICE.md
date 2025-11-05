# ⚠️ SECURITY NOTICE

## Credentials Exposure

**IMPORTANT:** Sensitive credentials were previously committed to this repository's git history. These credentials have been removed from all files, but they may still exist in git history.

## Actions Required

### 1. Rotate All Exposed Credentials

Since credentials were exposed in git history, you should **rotate/invalidate** them:

1. **Change Admin Password:**
   - Generate a new password hash: `node -e "const bcrypt = require('bcrypt'); bcrypt.hash('NEW_PASSWORD', 10).then(hash => console.log(hash));"`
   - Update `ADMIN_PASSWORD_HASH` in Vercel environment variables

2. **Rotate Supabase Keys:**
   - Go to Supabase Dashboard → Project Settings → API
   - Regenerate the `anon` key (or create a new one)
   - Update `SUPABASE_ANON_KEY` in Vercel environment variables

3. **Regenerate Session Secret:**
   - Generate new secret: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - Update `SESSION_SECRET` in Vercel environment variables

### 2. Clean Git History (Optional but Recommended)

To completely remove credentials from git history:

```bash
# Option 1: Use git filter-branch (may take time for large repos)
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch ENV_VARS.txt DEPLOYMENT_CHECKLIST.md DEPLOY.md WEBSITE_STATUS.md" \
  --prune-empty --tag-name-filter cat -- --all

# Option 2: Use BFG Repo-Cleaner (faster, recommended)
# Download from: https://rtyley.github.io/bfg-repo-cleaner/
# Then run:
# java -jar bfg.jar --delete-files ENV_VARS.txt
# git reflog expire --expire=now --all && git gc --prune=now --aggressive

# After cleaning, force push (WARNING: This rewrites history!)
git push origin --force --all
```

**⚠️ WARNING:** Force pushing rewrites git history. Coordinate with your team if working in a team.

### 3. Prevent Future Exposure

- ✅ `ENV_VARS.txt` is now in `.gitignore`
- ✅ All files have been cleaned of hardcoded credentials
- ✅ Documentation now uses placeholders only

### 4. Best Practices Going Forward

- ✅ Never commit `.env` files or files containing credentials
- ✅ Use environment variables for all secrets
- ✅ Use `.gitignore` to exclude sensitive files
- ✅ Review commits before pushing: `git diff --cached`
- ✅ Use tools like `git-secrets` or `truffleHog` to scan for secrets

## Current Status

- ✅ All hardcoded credentials removed from codebase
- ✅ `ENV_VARS.txt` added to `.gitignore`
- ✅ Documentation updated with placeholders
- ⚠️ Git history still contains old commits with credentials (requires rotation/cleanup)

