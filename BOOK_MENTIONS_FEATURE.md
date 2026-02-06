# 📚 Book Mentions Feature - Usage Guide

## Overview

You can now mention books from your bookshelf directly in your diary entries! When you click on a book mention, it will automatically navigate to the bookshelf and show that book in preview mode.

---

## How to Use

### 1. **Writing a Book Mention in Your Diary**

When writing a diary entry in the admin panel:

1. Type `@` to trigger the autocomplete dropdown
2. Start typing a book title or author name
3. Use **Arrow Up/Down** to navigate through suggestions
4. Press **Enter** or **Tab** to select a book
5. The mention will be inserted as `@[Book Title]`

**Keyboard Shortcuts:**
- `↑` / `↓` - Navigate through book suggestions
- `Enter` or `Tab` - Select highlighted book
- `Esc` - Close autocomplete dropdown

**Example:**
```
Today I finished reading @[The Great Gatsby] and it was amazing!

The themes in @[1984] really resonated with what I read in @[Brave New World].
```

---

### 2. **How Book Mentions Appear**

In your diary entries, book mentions will appear as:
- **Clickable links** with an accent color
- Special underline styling to distinguish them from regular links
- Hover effect for better interaction

---

### 3. **Clicking on a Book Mention**

When you click on a book mention:
1. You'll be taken to the `/bookshelf` page
2. The bookshelf will automatically:
   - Focus on that specific book in the network view
   - Zoom in smoothly to the book
   - Open the book details preview panel
3. You can see the book cover, title, author, and reading date

---

## Technical Implementation

### Backend Changes

**File: `server/routes/admin.js`**
- Added `/admin/api/books-search` endpoint for autocomplete
- Modified entry saving to process `@[Book Title]` mentions
- Converts mentions to markdown links: `[@BookTitle](/bookshelf?book=123)`

### Frontend Changes

**File: `public/js/admin.js`**
- Added autocomplete component for textarea
- Real-time book search as you type
- Keyboard navigation support

**File: `public/js/bookshelf.js`**
- Added URL parameter handling (`?book=<id>`)
- Auto-focus and zoom to book when loaded from URL
- Works in both network and timeline views

**File: `public/css/style.css`**
- Autocomplete dropdown styling
- Special link styling for book mentions

---

## Testing Checklist

### ✅ Basic Functionality
- [ ] Type `@` in diary textarea - autocomplete appears
- [ ] Search filters books by title/author
- [ ] Arrow keys navigate through suggestions
- [ ] Enter/Tab inserts book mention
- [ ] Escape closes autocomplete

### ✅ Entry Creation
- [ ] Save diary entry with book mentions
- [ ] Book mentions render as clickable links
- [ ] Links have special styling (bold, underline)

### ✅ Navigation to Bookshelf
- [ ] Click book mention → navigates to bookshelf
- [ ] URL includes `?book=<id>` parameter
- [ ] Bookshelf auto-focuses on the book
- [ ] Book details panel opens automatically

### ✅ Cross-Browser & Responsive
- [ ] Works on desktop browsers
- [ ] Works on mobile devices
- [ ] Autocomplete dropdown positioned correctly
- [ ] No visual glitches or overlaps

### ✅ Edge Cases
- [ ] Typing `@` with no books → no autocomplete shown
- [ ] Clicking outside autocomplete → closes it
- [ ] Multiple book mentions in one entry → all work
- [ ] Direct URL access (e.g., `/bookshelf?book=123`) → works
- [ ] Invalid book ID in URL → fails gracefully

---

## Example Usage Scenarios

### Scenario 1: Reading Journal
```
Finished @[Atomic Habits] today. The concepts around habit stacking 
reminded me of what I learned from @[Deep Work]. 

Both books emphasize the importance of intentional practice.
```

### Scenario 2: Book Comparisons
```
Comparing @[The Lean Startup] with @[Zero to One] - both excellent 
but very different approaches to building companies.
```

### Scenario 3: Cross-References
```
The ideas in @[Thinking, Fast and Slow] help explain why the 
strategies in @[Influence] are so effective.
```

---

## Notes

- **Format:** Book mentions must use `@[Book Title]` format (with square brackets)
- **Case Insensitive:** Search works regardless of capitalization
- **Exact Titles:** The book title must match exactly what's in your bookshelf
- **Backward Compatible:** Existing diary entries without book mentions remain unaffected

---

## Troubleshooting

### Autocomplete doesn't appear
- Make sure you have books in your bookshelf
- Check that you're logged in to the admin panel
- Try refreshing the page

### Book link doesn't work
- Verify the book exists in your bookshelf
- Check browser console for errors
- Ensure JavaScript is enabled

### Bookshelf doesn't auto-open book
- Wait a moment for the network to load
- Check that the book ID in the URL is correct
- Try manually clicking the book in the bookshelf

---

## Future Enhancements (Ideas)

- 📊 Show book mention statistics (most mentioned books)
- 🔍 Search diary entries by book mentions
- 📅 Timeline of when books were mentioned vs. read
- 💡 Suggest books to mention based on context
- 🏷️ Tag system integration with book categories

---

Enjoy connecting your reading with your writing! 📚✨
