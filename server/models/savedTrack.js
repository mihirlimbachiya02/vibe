import mongoose from "mongoose";

const savedTrackSchema = new mongoose.Schema({
    videoId: { type: String, required: true, unique: true },
    name: String,
    artist: mongoose.Schema.Types.Mixed,
    thumbnails: [mongoose.Schema.Types.Mixed],
    createdAt: { type: Date, default: Date.now },
});

export const SavedTrack = mongoose.model("SavedTrack", savedTrackSchema);
