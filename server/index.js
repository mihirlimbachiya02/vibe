import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import YTMusic from "ytmusic-api";
import mongoose from "mongoose";
import { Playlist } from "./models/playlist.js";
import { SavedTrack } from "./models/savedTrack.js";

dotenv.config();

const app = express();
const ytmusic = new YTMusic();
const isProduction = process.env.NODE_ENV === "production";
const MONGO_URI = process.env.MONGO_URI || (isProduction ? "" : "mongodb://127.0.0.1:27017/vibe_gen");
const PORT = Number(process.env.PORT || 5001);
const MAX_PLAYLIST_TRACKS = 200;
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const configuredOrigins = (process.env.CLIENT_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
const allowedOrigins = new Set([
    ...configuredOrigins,
    ...(!isProduction ? ["http://localhost:5173", "http://127.0.0.1:5173"] : []),
]);

function readPositiveInteger(name, fallback) {
    const value = process.env[name];
    if (!value) {
        return fallback;
    }

    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1) {
        throw new Error(`${name} must be a positive integer.`);
    }

    return parsed;
}

if (!MONGO_URI) {
    throw new Error("MONGO_URI must be configured before starting the server.");
}

if (!/^mongodb(?:\+srv)?:\/\//.test(MONGO_URI)) {
    throw new Error("MONGO_URI must be a valid MongoDB connection URI.");
}

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
    throw new Error("PORT must be a valid TCP port.");
}

for (const origin of configuredOrigins) {
    let parsedOrigin;
    try {
        parsedOrigin = new URL(origin);
    } catch {
        throw new Error("CLIENT_ORIGINS must contain valid origins without paths or trailing slashes.");
    }
    if (!["http:", "https:"].includes(parsedOrigin.protocol) || parsedOrigin.origin !== origin) {
        throw new Error("CLIENT_ORIGINS must contain exact HTTP(S) origins without paths or trailing slashes.");
    }
}

if (isProduction && allowedOrigins.size === 0) {
    throw new Error("CLIENT_ORIGINS must contain the deployed Vercel origin in production.");
}

const corsOptions = {
    origin(origin, callback) {
        const isLocalDevelopmentOrigin = !isProduction && origin && (() => {
            try {
                const parsedOrigin = new URL(origin);
                return ["localhost", "127.0.0.1"].includes(parsedOrigin.hostname);
            } catch {
                return false;
            }
        })();

        if (!origin || allowedOrigins.has(origin) || isLocalDevelopmentOrigin) {
            return callback(null, true);
        }
        return callback(new Error("Origin not allowed by CORS"));
    },
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
    maxAge: 600,
};

app.disable("x-powered-by");
app.set("trust proxy", isProduction ? 1 : false);
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "https://www.youtube.com", "https://s.ytimg.com"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "blob:", "https:"],
            connectSrc: ["'self'", "https:", "wss:"],
            frameSrc: ["https://www.youtube.com", "https://www.youtube-nocookie.com"],
            mediaSrc: ["'self'", "https:", "blob:"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            frameAncestors: ["'none'"],
            upgradeInsecureRequests: isProduction ? [] : null,
        },
    },
}));
app.use(cors(corsOptions));
app.use(express.json({ limit: "32kb" }));

const apiRateLimit = rateLimit({
    windowMs: readPositiveInteger("API_RATE_LIMIT_WINDOW_MS", 15 * 60 * 1000),
    limit: readPositiveInteger("API_RATE_LIMIT_MAX", isProduction ? 120 : 600),
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many requests. Please try again later." },
});

const recommendationRateLimit = rateLimit({
    windowMs: readPositiveInteger("RECOMMENDATION_RATE_LIMIT_WINDOW_MS", 15 * 60 * 1000),
    limit: readPositiveInteger("RECOMMENDATION_RATE_LIMIT_MAX", isProduction ? 40 : 100),
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many searches. Please try again later." },
});

app.use("/api", apiRateLimit);
app.use("/api", (req, res, next) => {
    if (!req.path.startsWith("/recommend")) {
        return next();
    }

    return recommendationRateLimit(req, res, next);
});

let ytReady = false;

async function initYT(attempt = 1) {
    try {
        await ytmusic.initialize();
        ytReady = true;
        console.log("✅ YouTube Music API Initialized");
    } catch (err) {
        console.error("❌ YT Music Init Error:", err.message);
        setTimeout(() => initYT(attempt + 1), Math.min(30000, 2000 * attempt));
    }
}
initYT();

mongoose
    .connect(MONGO_URI)
    .then(() => console.log("✅ MongoDB Connected"))
    .catch((err) => console.error("❌ MongoDB Connection Error:", err.name || "UnknownError"));

function requireDatabase(_req, res, next) {
    if (mongoose.connection.readyState !== 1) {
        return res.status(503).json({ error: "The database is temporarily unavailable." });
    }

    return next();
}

function normalizeTrack(track) {
    if (!track || typeof track !== "object" || Array.isArray(track)) {
        return null;
    }

    if (typeof track.videoId !== "string" || !VIDEO_ID_PATTERN.test(track.videoId)) {
        return null;
    }

    const name = typeof track.name === "string" ? track.name.trim().slice(0, 200) : "";
    const artistName = typeof track.artist === "string"
        ? track.artist
        : track.artist?.name;
    const thumbnails = Array.isArray(track.thumbnails)
        ? track.thumbnails.slice(0, 5).flatMap((thumbnail) => {
            if (typeof thumbnail?.url !== "string" || thumbnail.url.length > 2048) {
                return [];
            }

            try {
                const url = new URL(thumbnail.url);
                const allowedHost = /(^|\.)((youtube|ytimg|googleusercontent|ggpht)\.com)$/.test(url.hostname);
                return url.protocol === "https:" && allowedHost ? [{ url: url.href }] : [];
            } catch {
                return [];
            }
        })
        : [];

    return {
        videoId: track.videoId,
        name: name || "Unknown title",
        artist: {
            name: typeof artistName === "string" ? artistName.trim().slice(0, 200) : "Unknown artist",
        },
        thumbnails,
    };
}

function normalizeTracks(tracks) {
    if (!Array.isArray(tracks) || tracks.length > MAX_PLAYLIST_TRACKS) {
        return null;
    }

    const normalized = tracks.map(normalizeTrack);
    return normalized.every(Boolean) ? normalized : null;
}

function handleServerError(error, operation, res) {
    console.error(`${operation}:`, error);
    return res.status(500).json({
        error: isProduction ? "The request could not be completed." : error.message,
    });
}

app.post("/api/recommend", async (req, res) => {
    if (!ytReady) {
        return res
            .status(503)
            .json({ error: "YouTube Music service is still starting up. Try again in a moment." });
    }

    const { songName } = req.body ?? {};
    if (typeof songName !== "string" || !songName.trim() || songName.trim().length > 200) {
        return res.status(400).json({ error: "songName must contain 1 to 200 characters." });
    }

    try {
        const searchResults = await ytmusic.searchSongs(songName.trim());

        if (searchResults.length > 0) {
            const seed = searchResults[0];
            const recommendations = await ytmusic.getUpNexts(seed.videoId);

            res.json({
                seed,
                tracks: recommendations.map((track) => ({
                    videoId: track.videoId,
                    name: track.title ?? "Unknown title",
                    artist: { name: track.artists ?? "Unknown artist" },
                    thumbnails: track.thumbnail
                        ? [{ url: track.thumbnail }]
                        : (track.thumbnails ?? []),
                })),
            });
        } else {
            res.status(404).json({ message: "No songs found" });
        }
    } catch (error) {
        handleServerError(error, "Recommendation request failed", res);
    }
});

app.post("/api/save", requireDatabase, async (req, res) => {
    const { title, tracks: submittedTracks } = req.body ?? {};
    const tracks = normalizeTracks(submittedTracks);
    if (typeof title !== "string" || !title.trim() || title.trim().length > 100 || !tracks) {
        return res.status(400).json({ error: "A playlist title and up to 200 valid tracks are required." });
    }

    try {
        const newPlaylist = new Playlist({ title: title.trim(), tracks });
        await newPlaylist.save();
        res.json({ message: "Playlist saved to MongoDB!" });
    } catch (error) {
        handleServerError(error, "Playlist save failed", res);
    }
});

app.get("/api/playlists", requireDatabase, async (_req, res) => {
    try {
        const playlists = await Playlist.find().sort({ createdAt: -1 }).limit(100).lean();
        res.json(playlists);
    } catch (error) {
        handleServerError(error, "Playlist load failed", res);
    }
});

app.post("/api/playlists", requireDatabase, async (req, res) => {
    const { title } = req.body ?? {};
    if (typeof title !== "string" || !title.trim() || title.trim().length > 100) {
        return res.status(400).json({ error: "Playlist name must contain 1 to 100 characters." });
    }

    try {
        if ((await Playlist.countDocuments()) >= 200) {
                return res.status(429).json({ error: "Playlist limit reached." });
        }
        const playlist = await Playlist.create({ title: title.trim(), tracks: [] });
        res.status(201).json(playlist);
    } catch (error) {
        handleServerError(error, "Playlist creation failed", res);
    }
});

app.patch("/api/playlists/:playlistId", requireDatabase, async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.playlistId)) {
        return res.status(400).json({ error: "Invalid playlist ID" });
    }

    const { title } = req.body ?? {};
    if (typeof title !== "string" || !title.trim() || title.trim().length > 100) {
        return res.status(400).json({ error: "Playlist name must contain 1 to 100 characters." });
    }

    try {
        const playlist = await Playlist.findByIdAndUpdate(
            req.params.playlistId,
            { title: title.trim() },
            { returnDocument: "after", runValidators: true },
        );
        if (!playlist) {
            return res.status(404).json({ error: "Playlist not found" });
        }
        res.json(playlist);
    } catch (error) {
        handleServerError(error, "Playlist rename failed", res);
    }
});

app.delete("/api/playlists/:playlistId", requireDatabase, async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.playlistId)) {
        return res.status(400).json({ error: "Invalid playlist ID" });
    }

    try {
        const playlist = await Playlist.findByIdAndDelete(req.params.playlistId);
        if (!playlist) {
            return res.status(404).json({ error: "Playlist not found" });
        }
        res.json({ message: "Playlist deleted" });
    } catch (error) {
        handleServerError(error, "Playlist delete failed", res);
    }
});

app.post("/api/playlists/:playlistId/tracks", requireDatabase, async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.playlistId)) {
        return res.status(400).json({ error: "Invalid playlist ID" });
    }

    const { track } = req.body ?? {};
    const normalizedTrack = normalizeTrack(track);
    if (!normalizedTrack) {
        return res.status(400).json({ error: "A valid track with a YouTube video ID is required." });
    }

    try {
        const playlist = await Playlist.findById(req.params.playlistId);
        if (!playlist) {
            return res.status(404).json({ error: "Playlist not found" });
        }

        const alreadyIncluded = playlist.tracks.some(
            (savedTrack) => savedTrack.videoId === normalizedTrack.videoId,
        );
        if (!alreadyIncluded) {
            if (playlist.tracks.length >= MAX_PLAYLIST_TRACKS) {
                return res.status(400).json({ error: "A playlist cannot contain more than 200 tracks." });
            }
            playlist.tracks.push(normalizedTrack);
            await playlist.save();
        }
        res.json(playlist);
    } catch (error) {
        handleServerError(error, "Adding playlist track failed", res);
    }
});

app.delete("/api/playlists/:playlistId/tracks/:videoId", requireDatabase, async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.playlistId)) {
        return res.status(400).json({ error: "Invalid playlist ID" });
    }

    if (!VIDEO_ID_PATTERN.test(req.params.videoId)) {
        return res.status(400).json({ error: "Invalid YouTube video ID." });
    }

    try {
        const playlist = await Playlist.findById(req.params.playlistId);
        if (!playlist) {
            return res.status(404).json({ error: "Playlist not found" });
        }

        playlist.tracks = playlist.tracks.filter(
            (track) => track.videoId !== req.params.videoId,
        );
        await playlist.save();
        res.json(playlist);
    } catch (error) {
        handleServerError(error, "Removing playlist track failed", res);
    }
});

app.get("/api/saved-tracks", requireDatabase, async (_req, res) => {
    try {
        const tracks = await SavedTrack.find().sort({ createdAt: -1 }).limit(500).lean();
        res.json(tracks);
    } catch (error) {
        handleServerError(error, "Saved tracks load failed", res);
    }
});

app.post("/api/saved-tracks", requireDatabase, async (req, res) => {
    const { track } = req.body ?? {};
    const normalizedTrack = normalizeTrack(track);
    if (!normalizedTrack) {
        return res.status(400).json({ error: "A valid track with a YouTube video ID is required." });
    }

    try {
        const alreadySaved = await SavedTrack.exists({ videoId: normalizedTrack.videoId,});
        if ( !alreadySaved && (await SavedTrack.countDocuments())>= 1000) {
                return res.status(429).json({ error: "Saved songs limit reached." });
                }
        const savedTrack = await SavedTrack.findOneAndUpdate(
            { videoId: normalizedTrack.videoId },
            { $setOnInsert: normalizedTrack },
            { returnDocument: "after", upsert: true, runValidators: true },
        );
        res.status(201).json(savedTrack);
    } catch (error) {
        handleServerError(error, "Saving track failed", res);
    }
});

app.delete("/api/saved-tracks/:videoId", requireDatabase, async (req, res) => {
    if (!VIDEO_ID_PATTERN.test(req.params.videoId)) {
        return res.status(400).json({ error: "Invalid YouTube video ID." });
    }

    try {
        const result = await SavedTrack.deleteOne({ videoId: req.params.videoId });
        if (result.deletedCount === 0) {
            return res.status(404).json({ error: "Saved track not found" });
        }
        res.json({ message: "Track removed from saved songs" });
    } catch (error) {
        handleServerError(error, "Removing saved track failed", res);
    }
});

app.get("/health/live", (_req, res) => {
    res.status(200).json({ status: "ok" });
});

app.get("/health/ready", (_req, res) => {
    const services = {
        database: mongoose.connection.readyState === 1,
        music: ytReady,
    };
    const ready = Object.values(services).every(Boolean);
    res.status(ready ? 200 : 503).json({
        status: ready ? "ready" : "not_ready",
        services,
    });
});

app.get("/", (_req, res) => {
    res.send("Server is up and running!");
});

app.use("/api", (_req, res) => {
    res.status(404).json({ error: "API endpoint not found." });
});

app.use((error, _req, res, _next) => {
    if (error.type === "entity.too.large") {
        return res.status(413).json({ error: "Request body exceeds the 32 KB limit." });
    }
    if (error instanceof SyntaxError && "body" in error) {
        return res.status(400).json({ error: "Request body must be valid JSON." });
    }
    if (error.message === "Origin not allowed by CORS") {
        return res.status(403).json({ error: "Request origin is not allowed." });
    }

    return handleServerError(error, "Unhandled request error", res);
});

app.listen(PORT, () =>
    console.log(`🚀 Server running on http://localhost:${PORT}`),
);
