# Vibe — Music Discovery

> **Note:** This is a public demo with no login. Playlists and saved songs are shared by all visitors, and there is a cap on how many can be stored.

## Project overview

Vibe is a browser-based music discovery app. A user searches for a song, receives related tracks, saves individual tracks, and manages playlists. Playback is provided by YouTube's embedded IFrame player. The app has a compact floating player and an expanded video view.

## Features

### Music discovery

- Submit a song, artist, or mood from the search field.
- The API searches YouTube Music for a seed track, then retrieves its up-next recommendations.
- Results display track names, artists, and available thumbnails.
- Clear the search text with the clear button.

### Library and playlists

- Open **Your library** to load playlists and individually saved songs.
- Create a playlist with a name.
- Rename or delete a playlist.
- Add a track to a playlist from discovery results or saved tracks.
- Remove a track from a playlist or remove an individually saved track.
- Save an entire discovery result set as a playlist.

### Playback

- Start playback from a discovery result, a saved track, or a playlist track.
- Use the floating player for previous, play/pause, next, expand/collapse, and close actions.
- Click the album art or expand button to show the larger in-app video view.
- Drag the player from its non-button area to move it; it is clamped to the viewport.
- Collapsing an expanded player restores its previous compact position.
- The compact player is a controls-first bar; the embedded video is shown when expanded.

## Technology stack

| Area | Technologies |
| --- | --- |
| Client | React 19, React DOM, Vite 8, Axios |
| Server | Node.js, Express 5, CORS, dotenv, Helmet, express-rate-limit |
| Music search | `ytmusic-api` |
| Persistence | MongoDB through Mongoose |
| Embedded playback | YouTube IFrame Player API |
| Client quality checks | ESLint |

## Project structure

```text
music-recommendation/
├── README.md                      # This project guide
├── client/
│   ├── index.html                 # HTML entry point and page metadata
│   ├── .env.example               # Public API origin template (no secrets)
│   ├── package.json               # Client dependencies and scripts
│   ├── vercel.json                # SPA fallback and security headers for Vercel
│   ├── vite.config.js             # Vite and React plugin configuration
│   └── src/
│       ├── main.jsx               # React application bootstrap
│       ├── App.jsx                # Discovery, library, API calls, player state/UI
│       ├── App.css                # App components and responsive layout
│       └── index.css              # Global styles and design tokens
├── server/
│   ├── .env                        # Local server settings; private and Git-ignored
│   ├── .env.example               # Safe server-side variable template
│   ├── index.js                   # Express API, YouTube Music and MongoDB setup
│   ├── package.json               # Server dependencies and scripts
│   └── models/
│       ├── playlist.js            # Playlist Mongoose model
│       └── savedTrack.js          # Saved track Mongoose model
├── .gitignore                     # Excludes private env files and generated output
├── .node-version                  # Node runtime used by Render
└── render.yaml                    # Render API-only web-service blueprint
```

## How the application works

### Discovery request

1. The client submits the search text to `POST /api/recommend`.
2. The server checks that its YouTube Music client has initialized and that `songName` is a non-empty string.
3. The server searches for songs, uses the first result as the seed, and requests its up-next tracks.
4. The response is stored in client state and rendered in the discovery list.

### Saving and loading

- The **Your library** action requests playlists and saved tracks in parallel.
- Playlist and saved-track writes are sent to the API; successful responses update React state so the UI reflects the change.
- MongoDB is the persistent store. If MongoDB is unavailable, library operations that require it fail and the client surfaces an error.

### Queue selection

Starting a track passes its containing list as the playback queue. This list is the discovery results, a playlist, or the saved tracks. Previous and next select neighboring items in that queue; they do not wrap around at the ends.

### YouTube player lifecycle

- The YouTube IFrame API is loaded on demand.
- When the selected track changes, the current player is destroyed and a new player is created for the track's `videoId`.
- The player is created under a stable container because the IFrame API replaces its target with an iframe.
- Player readiness, state, playback errors, and blocked autoplay are reflected in the player controls/status.

## Local setup

### Prerequisites

- Node.js and npm versions compatible with the installed Vite 8 and server dependencies.
- MongoDB running locally or a MongoDB connection string.
- Network access to YouTube Music and YouTube's embed/player services.

### Install dependencies

Run each install from its package directory:

```powershell
Set-Location .\client
npm install

Set-Location ..\server
npm install
```

### Configure the server

Keep private backend configuration in `server/.env` (ignored by Git). Use the committed `server/.env.example` only as a safe template; it contains no production credentials. If setting up a fresh checkout, copy the example to `server/.env`, then enter your MongoDB connection string there:

```dotenv
MONGO_URI=your_mongodb_connection_string
PORT=5001
CLIENT_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,https://your-app.vercel.app
```

The server code defaults to the local MongoDB URI and port `5001` if those variables are not set. The example intentionally leaves `MONGO_URI` blank; the local fallback works if MongoDB is running on the same machine. Keep it in `server/.env` locally and enter it directly into Render's secret `MONGO_URI` variable for deployment. Never put it in documentation, client environment variables, or source control. The root `.gitignore` excludes `.env` files while allowing `.env.example` templates.

### Start the application

Open two terminals from the project directory.

Terminal 1 — API:

```powershell
Set-Location .\server
npm run dev
```

Terminal 2 — client:

```powershell
Set-Location .\client
npm run dev
```

Open the local URL printed by Vite (normally `http://localhost:5173/`). Keep `VITE_API_BASE_URL` blank in the local `client/.env`; the client uses relative `/api` paths and Vite proxies these to `http://localhost:5001`. For Vercel, set `VITE_API_BASE_URL` in the Vercel project settings to the public Render API base URL (for example, `https://your-api.onrender.com`). This URL is public and is not a secret.

The server logs MongoDB and YouTube Music initialization status. Search requests return a `503` until the YouTube Music client has finished initializing.


## API and deployment security

The project is configured as a public, no-login application. These controls reduce common exposure and abuse, but do not make public endpoints private.

- **Keep secrets server-side.** `MONGO_URI` is only read by the Express server. Set it in Render's service environment; never use a `VITE_` variable for credentials. The current YouTube Music integration does not require an API key.
- **Commit templates, not credentials.** `server/.env.example` and `client/.env.example` contain safe examples. `.gitignore` excludes `.env`, `.env.*`, dependency folders, and build output while allowing `.env.example`.
- **Separate Vercel and Render.** `client/` is the Vercel project root; `render.yaml` deploys `server/` as the Render API. The browser calls Render using `VITE_API_BASE_URL`; the Render API only accepts exact browser origins listed in `CLIENT_ORIGINS`.
- **Add custom domains deliberately.** Set `CLIENT_ORIGINS` on Render to the exact Vercel origin, such as `https://music.example.com`. Do not include paths or trailing slashes. For Vercel preview deployments, add only the specific preview origins you trust.
- **CORS is not authentication.** CORS limits which browser origins can read responses. It cannot stop scripts, command-line clients, or other servers from sending requests. The API remains publicly accessible without user accounts.
- **Rate limits.** All `/api` requests have a per-IP limit; `/api/recommend` has an additional stricter limit to reduce upstream search abuse. The server trusts one reverse proxy hop in production for client IP identification.
- **Request validation and bounds.** JSON bodies are limited to 32 KB. Track IDs, titles, playlist sizes, and thumbnail URLs are validated or normalized. Collection reads are capped, and the total number of playlists (200) and saved songs (1000) is limited. Unknown API paths return JSON 404 responses.
- **Response safety.** Helmet sets security headers and a Content Security Policy that permits the YouTube player. Production errors return generic messages while server logs retain diagnostic details.
- **Shared library data.** Without login or per-user ownership, playlists and saved tracks use shared collections. Anyone who discovers the public API can read or modify shared library data. Add authentication and authorization before using this for private or per-user libraries.
- **Rotate exposed secrets.** If a real MongoDB URI or other credential was ever committed, changing `.gitignore` does not remove it from Git history. Rotate the credential with its provider and update the Render environment.

### Deploy the frontend on Vercel and API on Render

1. For local setup, copy `server/.env.example` to `server/.env`. Optionally copy `client/.env.example` to `client/.env` and leave `VITE_API_BASE_URL` blank for local Vite development. Never copy real secret values into either `.env.example`.
2. Push the project to a Git repository only after verifying that it contains no `.env` files, MongoDB connection strings, or real credentials. `.gitignore` excludes the private env files.
3. **Deploy the API on Render:** create a Blueprint from the repository and select the root `render.yaml`. It sets `rootDir: server`, builds with `npm ci`, and starts with `npm start`.
4. In Render's environment settings, enter `MONGO_URI` as a secret value from the MongoDB provider. Do not put it into Git, chat, Vercel, or any `VITE_` variable. The app reads this value only on the server.
5. Set Render's `CLIENT_ORIGINS` to the exact Vercel production origin, for example `https://your-app.vercel.app` (no trailing slash). Add trusted preview origins only when necessary.
6. Wait for `/health/live` to pass, then copy the public Render service origin, e.g. `https://your-api.onrender.com`.
7. **Deploy the frontend on Vercel:** import the same repository and set the Vercel Project Root Directory to `client`. Vercel detects Vite; use `npm run build` and `dist` as the output directory.
8. In Vercel Project Settings → Environment Variables, set `VITE_API_BASE_URL` to the Render API origin with no `/api` suffix, for example `https://your-api.onrender.com`. It is a public URL, not a secret. Redeploy after setting it.
9. Open the Vercel site and test discovery and library actions. If CORS blocks requests, correct `CLIENT_ORIGINS` on Render to the exact site origin.
10. Keep the MongoDB provider network/access settings restricted appropriately for Render. Rotate `MONGO_URI` if it was ever committed or shared.

The Render `NODE_VERSION` is set to 22 in `render.yaml`. `/health/live` only confirms that the server process responds. `/health/ready` reports whether MongoDB and YouTube Music are ready; upstream outages can make it return HTTP `503`.

The rate limiter is in-memory and protects a single Render instance. If the API is scaled to multiple instances, configure a shared rate-limit store (for example Redis) so limits are consistent across instances.

## Backend API

All endpoints are served by the Express application. JSON request bodies are limited to 32 KB, CORS uses an origin allowlist, and API rate limits apply.

### Discovery

#### `POST /api/recommend`

Searches for a seed song and returns related tracks.

Request:

```json
{
  "songName": "song or artist to search for"
}
```

Success response:

```json
{
  "seed": {
    "videoId": "youtube-video-id",
    "name": "Seed track title",
    "artist": {
      "name": "Artist name"
    },
    "thumbnails": []
  },
  "tracks": [
    {
      "videoId": "youtube-video-id",
      "name": "Related track title",
      "artist": {
        "name": "Artist name"
      },
      "thumbnails": []
    }
  ]
}
```

The seed object is returned from the music-search library; recommendation tracks are normalized by the server to `videoId`, `name`, `artist`, and `thumbnails`.

Possible outcomes:

- `200` — search and recommendation response.
- `400` — missing or invalid `songName`.
- `404` — no matching songs.
- `503` — YouTube Music client is still initializing.
- `500` — search/recommendation operation failed.
- `413` — request body exceeds the configured size.
- `429` — per-IP rate limit exceeded.

### Legacy discovery-save endpoint

#### `POST /api/save`

Saves the submitted request body as a playlist and responds with a message. The current client also supports the more complete playlist endpoints below.

### Playlists

#### `GET /api/playlists`

Returns playlists sorted newest first.

#### `POST /api/playlists`

Creates an empty playlist.

```json
{
  "title": "Late night drive"
}
```

Returns the created playlist with HTTP `201`. A missing, non-string, or blank title returns `400`.

#### `PATCH /api/playlists/:playlistId`

Renames an existing playlist.

```json
{
  "title": "Updated playlist title"
}
```

Returns `400` for an invalid MongoDB ID or blank title, `404` if the playlist does not exist, and `200` with the updated playlist on success.

#### `DELETE /api/playlists/:playlistId`

Deletes a playlist and its embedded track list. Returns `400` for an invalid ID, `404` if it does not exist, or a confirmation message on success.

#### `POST /api/playlists/:playlistId/tracks`

Adds a track to a playlist. Duplicate `videoId` values are ignored.

```json
{
  "track": {
    "videoId": "youtube-video-id",
    "name": "Track title",
    "artist": {
      "name": "Artist name"
    },
    "thumbnails": []
  }
}
```

Returns the updated playlist. A missing ID/track/video ID returns `400`; a non-existent playlist returns `404`.

#### `DELETE /api/playlists/:playlistId/tracks/:videoId`

Removes a track whose `videoId` matches the URL value. Returns the updated playlist, or an error if the ID is invalid or playlist is missing.

### Saved tracks

#### `GET /api/saved-tracks`

Returns individually saved tracks, newest first.

#### `POST /api/saved-tracks`

Saves a track. A track must have a string `videoId`. The operation is upsert-based, so saving an already-saved video does not create a duplicate.

```json
{
  "track": {
    "videoId": "youtube-video-id",
    "name": "Track title",
    "artist": {
      "name": "Artist name"
    },
    "thumbnails": []
  }
}
```

Returns the saved track with HTTP `201`. Missing or invalid `videoId` returns `400`.

#### `DELETE /api/saved-tracks/:videoId`

Removes an individually saved track. Returns a confirmation message on success or `404` if there was no saved record for that ID.

### Health checks

#### `GET /health/live`

Returns HTTP `200` with `{ "status": "ok" }` when the process can respond. Render uses this endpoint for liveness checks.

#### `GET /health/ready`

Returns HTTP `200` when MongoDB and YouTube Music are initialized, or `503` with service readiness booleans otherwise.

#### `GET /`

Returns the text `Server is up and running!`. The Vercel frontend is deployed separately.

## Data model

### Playlist

Mongoose model: `Playlist` (MongoDB collection: `playlists`).

| Field | Type | Description |
| --- | --- | --- |
| `_id` | ObjectId | MongoDB-generated playlist identifier |
| `title` | String | Playlist title |
| `tracks` | Array | Embedded track records; each track includes its YouTube `videoId` and display metadata |
| `createdAt` | Date | Defaults to creation time |

### Saved track

Mongoose model: `SavedTrack` (MongoDB collection: `savedtracks`).

| Field | Type | Description |
| --- | --- | --- |
| `_id` | ObjectId | MongoDB-generated saved-track identifier |
| `videoId` | String | Required, unique YouTube video identifier |
| `name` | String | Track title |
| `artist` | Mixed | Artist metadata from the music-search result |
| `thumbnails` | Array of Mixed | Thumbnail metadata |
| `createdAt` | Date | Defaults to creation time |

The saved-track schema enforces a unique `videoId`. Playlist tracks are stored as an array rather than as references to saved-track documents.

## Player behavior and limitations

- Playback uses the official YouTube embedded player; this project does not download or proxy audio/video.
- Compact mode hides the video and keeps the playback controls visible. Expanding reveals the embedded video.
- The expanded view is centered and sized to the viewport. Its size is recalculated when the viewport changes.
- The floating player can be dragged from non-interactive areas. Buttons, links, and the iframe are excluded from drag initiation.
- Browsers can block autoplay; use the in-app play button if playback does not start automatically.
- YouTube may reject videos that are private, region-restricted, age-restricted, unavailable, or not permitted for embedding. The app cannot override these restrictions.
- The embedded player can show a YouTube unavailable message even when the track appears in search results.
- Playback state and queue position are client-side state and are not persisted between reloads.

## Validation and development commands

Run commands from `client/`:

```powershell
npm run dev       # Start Vite development server
npm run build     # Build the production client into client/dist
npm run preview   # Serve a production build locally
npm run lint      # Run ESLint
```

Run commands from `server/`:

```powershell
npm run dev       # Start the Express API
npm start         # Start the Express API
```

The server package currently has no automated test suite; its `test` script is a placeholder that exits with an error.

## Troubleshooting

### The client says the backend is not running

1. Start the server from `server/` with `npm run dev`.
2. Confirm the server reports port `5001`.
3. Visit the Render API origin; the response should say `Server is up and running!`.
4. Confirm Vercel `VITE_API_BASE_URL` points to that Render API and Render `CLIENT_ORIGINS` matches the Vercel site origin exactly.

### Search reports that YouTube Music is still starting

Wait for the server log `YouTube Music API Initialized`, then submit the search again. If initialization repeatedly fails, check network access and the server terminal output.

### The library cannot load or save

- Confirm MongoDB is running and `MONGO_URI` points to the correct database.
- Check the server terminal for a MongoDB connection error.
- Reopen **Your library** to reload the playlists and saved tracks.

### The video is black, unavailable, or does not start

- Expand the player to make the video visible.
- Press play if autoplay was blocked.
- Try another track if YouTube reports the video is unavailable.
- Check browser/network access to YouTube and avoid ad-blocking or network policies that block YouTube's player resources.

### Port is already in use

Stop the process using the requested port or choose a different server `PORT`. If Vite selects another port automatically, use the URL printed by its terminal; the API proxy continues to target port `5001` by default.

### The player moved off-screen after resizing

The floating player is clamped to the visible viewport on resize. Drag it from the track information or another non-button area. The close, transport, album-art, and expand buttons are interactive and do not initiate a drag.
