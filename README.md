# Digital Diary

A minimalist, elegant digital diary website inspired by [marmik.xyz](https://marmik.xyz/blogs). Write your thoughts in markdown and share them with the world.

## Features

- 📝 **Markdown Support** - Write entries in markdown
- 🌓 **Dark/Light Mode** - Beautiful theme toggle with persistent preferences
- 🔒 **Password Protected** - Secure admin panel for creating entries
- 📱 **Responsive Design** - Works beautifully on all devices
- ⚡ **Real-time Entry Creation** - Write and save entries instantly
- 🎨 **Elegant Design** - Inspired by minimalist aesthetic
- 🗑️ **Delete Entries** - Remove entries from admin panel

## Local Development

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn

### Setup

1. Clone the repository:
```bash
git clone <your-repo-url>
cd scdiary
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables (optional):
```bash
# Default password is 'admin123'
# To change it, set these environment variables:
export ADMIN_PASSWORD=your_secure_password
export SESSION_SECRET=your_session_secret
```

4. Start the development server:
```bash
npm start
```

5. Open your browser and navigate to:
- Main diary: `http://localhost:3000`
- Admin panel: `http://localhost:3000/admin`

### Default Credentials

- **Password**: `admin123` (change this in production!)

## Deployment to Vercel

### ⚠️ Important: File Storage Limitation

Vercel's serverless functions have a **read-only filesystem**. Your `entries.json` file will **NOT persist** across deployments or function restarts. 

**You need a database solution for production!**

### Quick Deploy Steps

1. **Push to GitHub:**
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin <your-github-repo-url>
git push -u origin main
```

2. **Import in Vercel:**
   - Go to [vercel.com](https://vercel.com)
   - Click "Add New Project"
   - Import your GitHub repository

3. **Set Environment Variables** in Vercel project settings:
   - `ADMIN_PASSWORD` - Your secure admin password
   - `SESSION_SECRET` - Random string (generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
   - `NODE_ENV` - Set to `production`

4. **Deploy!**

### Database Solutions

For production, you'll need to replace file storage with a database:

**Recommended Options:**
- **MongoDB Atlas** (free tier available)
- **Vercel Postgres** (integrated with Vercel)
- **Supabase** (free tier, PostgreSQL)
- **Vercel KV** (Redis-based, simple key-value)

I can help you add database support if you'd like!

## Usage

### Writing Entries

1. Navigate to `/admin`
2. Enter your password
3. Write your entry in markdown
4. Click "Save" when done
5. Your entry appears at the top of the main page

### Markdown Examples

```markdown
# Heading 1
## Heading 2

**Bold text** and *italic text*

- Bullet point 1
- Bullet point 2

> This is a blockquote

[Link text](https://example.com)
```

## Color Scheme

Inspired by marmik.xyz:

- **Light Mode**: Warm beige background (#EFE8DC)
- **Dark Mode**: Pure black background (#000000)
- **Accent**: Burnt orange (#C16A28)
- **Typography**: Elegant serif fonts

## Project Structure

```
scdiary/
├── public/
│   ├── css/
│   │   └── style.css          # All styles including themes
│   └── js/
│       ├── main.js            # Theme toggle
│       └── admin.js           # Admin panel functionality
├── server/
│   ├── server.js              # Express server
│   ├── routes/
│   │   ├── diary.js           # Public diary routes
│   │   └── admin.js           # Admin panel routes
│   └── data/
│       └── entries.json       # Diary entries storage
├── views/
│   ├── index.ejs              # Main diary page
│   └── admin.ejs              # Admin panel
├── package.json
├── vercel.json                # Vercel configuration
└── README.md
```

## Tech Stack

- **Backend**: Node.js + Express
- **Template Engine**: EJS
- **Markdown**: marked.js
- **Authentication**: bcrypt + express-session
- **Styling**: Pure CSS with CSS variables
- **Deployment**: Vercel

## Security Notes

- Change the default password before deployment
- Use HTTPS in production (Vercel provides this automatically)
- Keep your `SESSION_SECRET` secure and random
- Consider implementing rate limiting for login attempts

## License

MIT

## Credits

Design inspiration: [marmik.xyz](https://marmik.xyz/blogs)

