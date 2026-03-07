# Eva's Gift - Virtual iPhone Scratchers

A virtual iPhone experience built as a surprise gift. Open `index.html` in any browser to run it.

## How it works

1. **Lock Screen** - Swipe up to unlock the phone
2. **Home Screen** - Browse through iOS-style app icons across two pages (swipe left/right)
3. **App Store** - Tap the App Store icon in the dock to open it
4. **Eva's Game** - Tap the featured "Eva's Game" card or the GET button to start downloading
5. **Download** - Watch the download animation complete
6. **Eva Scratchers** - Scratch off three lottery tickets to reveal Amazon gift codes

## Customization

Open `index.html` and find the `ticketData` array near the bottom of the `<script>` section to customize:

- **Prize names** (`prize` field)
- **Gift codes** (`code` field)
- **Ticket labels** (`label` field)

## Technical details

- Single self-contained HTML file, no dependencies
- Works on desktop and mobile (touch + mouse support)
- Canvas-based scratch-off with realistic metallic texture
- CSS animations for all transitions
- Responsive: fills the screen on mobile devices
