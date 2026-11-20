# Markdown game descriptions

Open a game in the TitleDeck Library Manager, choose **Edit description**, and switch **Format** to **Markdown**. Type or paste using the existing Steam keyboard. **Open .md file** loads a UTF-8 file into the selected game's draft on clients with a file picker. Preview the result and choose **Save description**. If the picker is unavailable, paste the text instead. Choose **Plain text** to display Markdown punctuation literally.

| Formatting | Example |
| --- | --- |
| Bold | `**Important**` |
| Italics | `*Optional*` |
| Underline | `++Underline++` |
| Strikethrough | `~~Outdated~~` |
| Heading | `## About the game` (levels 1–6) |
| Numbered list | `1. First step`, then `2. Second step` on the next line |
| Bulleted list | `- Item` on each line |
| Link | `[Walkthrough](https://example.com/guide)` |
| Image | `![Screenshot](https://img.itch.zone/path/screenshot.png)` |
| Video | `![video: Trailer](https://cdn.akamai.steamstatic.com/steam/apps/123/movie.mp4)` |

Leave a blank line between paragraphs and before lists. Underline is a TitleDeck extension. Links accept absolute HTTPS URLs and open externally. Images and direct MP4/WebM clips are supported only from TitleDeck's approved HTTPS media hosts (currently `img.itch.zone`, `cdn.imgchest.com`, and selected Steam CDN hosts). Custom ports, credentials, local paths, other hosts, and unsupported file types are rejected and shown as readable labels. YouTube links remain ordinary external links.

Images display inline with bounded dimensions and alt text. Videos display inline with controls and never autoplay; playback starts only when the user activates the video controls. Media unloads when its description is replaced or its panel is removed. If loading or playback fails, use the displayed external link. Game Info and Below Play show media; Artwork Footer and saved-description summaries show compact text only. HTML is displayed as text. Inline media behavior and host policy are a proposed upstream contribution and may change after maintainer review and Steam Deck verification.

## JSON compatibility

JSON remains the format for backups and bulk interchange. `descriptions` contains the saved body for each AppID. `description_formats` is an optional map with `markdown` for descriptions that opt in. Existing files without the map display all descriptions literally. The example includes one of each.

```json
{
  "schema": 1,
  "aliases": {},
  "descriptions": {
    "620": "Write *this* literally.",
    "3500000123": "**Walkthrough**\n\n1. Read the introduction\n2. Start the game"
  },
  "description_formats": {"3500000123": "markdown"}
}
```

An import applies the format together with each incoming body. An incoming body without a format becomes plain text. Other AppIDs keep their formats. Use **Save a backup** before downgrading. Older versions display Markdown source literally and may discard the format map when saving their settings.

Integrations can use the backend `import_aliases` and `export_aliases` JSON calls. A local writer that edits `titledeck.json` directly should acquire an exclusive Linux `flock` on the settings directory across the full read, merge and atomic replacement. Older TitleDeck builds do not use that lock.
