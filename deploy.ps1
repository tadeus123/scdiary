# Quick Deploy Script for GitHub + Vercel
# Run this after creating your GitHub repository

Write-Host "=== Digital Diary Deployment Helper ===" -ForegroundColor Cyan
Write-Host ""

# Check if remote exists
$remote = git remote get-url origin 2>$null

if ($remote) {
    Write-Host "✓ GitHub remote found: $remote" -ForegroundColor Green
    Write-Host ""
    Write-Host "Pushing to GitHub..." -ForegroundColor Yellow
    git push -u origin main
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✓ Successfully pushed to GitHub!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Next steps:" -ForegroundColor Cyan
        Write-Host "1. Go to https://vercel.com and sign in"
        Write-Host "2. Click 'Add New Project'"
        Write-Host "3. Import your repository"
        Write-Host "4. Add environment variables (see ENV_VARS.txt)"
        Write-Host "5. Deploy!"
    } else {
        Write-Host ""
        Write-Host "✗ Push failed. Make sure you have a GitHub repository created." -ForegroundColor Red
        Write-Host "  Create one at: https://github.com/new" -ForegroundColor Yellow
    }
} else {
    Write-Host "✗ No GitHub remote found." -ForegroundColor Red
    Write-Host ""
    Write-Host "To set up GitHub:" -ForegroundColor Yellow
    Write-Host "1. Go to https://github.com/new"
    Write-Host "2. Create a repository named 'scdiary'"
    Write-Host "3. DON'T initialize with README"
    Write-Host "4. Copy the repository URL"
    Write-Host "5. Run: git remote add origin <your-repo-url>"
    Write-Host "6. Run this script again"
    Write-Host ""
    Write-Host "Or manually push with:" -ForegroundColor Cyan
    Write-Host "  git remote add origin https://github.com/YOUR_USERNAME/scdiary.git"
    Write-Host "  git push -u origin main"
}

