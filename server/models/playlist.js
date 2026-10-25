import mongoose from "mongoose";

const trackSchema = new mongoose.Schema(
    {
        videoId: { type: String, required: true },
        name: String,
        artist: { name: String },
        thumbnails: [new mongoose.Schema({ url: String }, { _id: false })],
    },
    { _id: false },
);

const playlistSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true, maxlength: 100 },
    tracks: {
        type: [trackSchema],
        default: [],
        validate: {
            validator: (tracks) => tracks.length <= 200,
            message: "A playlist cannot contain more than 200 tracks.",
        },
    },
    createdAt: { type: Date, default: Date.now },
});

export const Playlist = mongoose.model("Playlist", playlistSchema);
