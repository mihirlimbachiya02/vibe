import { useEffect, useId, useRef, useState } from "react";
import axios from "axios";
import { createPortal } from "react-dom";
import "./App.css";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");

let youtubeIframeApiPromise;

function loadYouTubeIframeApi() {
    if (window.YT?.Player) {
        return Promise.resolve(window.YT);
    }

    if (!youtubeIframeApiPromise) {
        youtubeIframeApiPromise = new Promise((resolve, reject) => {
            const previousReady = window.onYouTubeIframeAPIReady;
            window.onYouTubeIframeAPIReady = () => {
                previousReady?.();
                resolve(window.YT);
            };

            let script = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
            if (!script) {
                script = document.createElement("script");
                script.src = "https://www.youtube.com/iframe_api";
                script.onerror = () => reject(new Error("Could not load the YouTube player."));
                document.head.appendChild(script);
            }
        });
    }

    return youtubeIframeApiPromise;
}

function PlaylistPicker({ playlists, onSelect, disabled = false, label }) {
    const [isOpen, setIsOpen] = useState(false);
    const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
    const pickerId = useId();
    const pickerRef = useRef(null);
    const menuRef = useRef(null);
    const triggerRef = useRef(null);

    useEffect(() => {
        if (!isOpen) {
            return undefined;
        }

        const updateMenuPosition = () => {
            const trigger = triggerRef.current;
            if (!trigger) {
                return;
            }

            const bounds = trigger.getBoundingClientRect();
            const viewportPadding = 12;
            const menuWidth = Math.min(260, window.innerWidth - viewportPadding * 2);
            const menuHeight = Math.min(270, 54 + playlists.length * 48);
            const spaceBelow = window.innerHeight - bounds.bottom - 8;
            const openAbove = spaceBelow < menuHeight && bounds.top > spaceBelow;

            setMenuPosition({
                top: openAbove
                    ? Math.max(viewportPadding, bounds.top - menuHeight - 8)
                    : Math.min(
                        bounds.bottom + 8,
                        window.innerHeight - menuHeight - viewportPadding,
                    ),
                left: Math.max(
                    viewportPadding,
                    Math.min(
                        bounds.right - menuWidth,
                        window.innerWidth - menuWidth - viewportPadding,
                    ),
                ),
            });
        };

        const closeOnOutsideClick = (event) => {
            if (
                !pickerRef.current?.contains(event.target) &&
                !menuRef.current?.contains(event.target)
            ) {
                setIsOpen(false);
            }
        };

        document.addEventListener("pointerdown", closeOnOutsideClick);
        window.addEventListener("resize", updateMenuPosition);
        window.addEventListener("scroll", updateMenuPosition, true);
        updateMenuPosition();
        return () => {
            document.removeEventListener("pointerdown", closeOnOutsideClick);
            window.removeEventListener("resize", updateMenuPosition);
            window.removeEventListener("scroll", updateMenuPosition, true);
        };
    }, [isOpen, playlists.length]);

    useEffect(() => {
        if (!isOpen) {
            return undefined;
        }

        const frame = requestAnimationFrame(() => {
            menuRef.current?.querySelector('[role="menuitem"]')?.focus();
        });
        return () => cancelAnimationFrame(frame);
    }, [isOpen]);

    const choosePlaylist = (playlistId) => {
        setIsOpen(false);
        onSelect(playlistId);
        triggerRef.current?.focus();
    };

    return (
        <div className="playlist-picker-wrap" ref={pickerRef}>
            <button
                ref={triggerRef}
                type="button"
                className={`playlist-picker-trigger${isOpen ? " is-open" : ""}`}
                aria-haspopup="menu"
                aria-expanded={isOpen}
                aria-controls={pickerId}
                aria-label={label}
                disabled={disabled}
                onClick={() => setIsOpen((open) => !open)}
            >
                <span className="playlist-picker-icon" aria-hidden="true">＋</span>
                <span className="playlist-picker-label">
                    {disabled ? "Adding to playlist…" : "Add to playlist"}
                </span>
                <span className="playlist-picker-chevron" aria-hidden="true" />
            </button>
            {isOpen && !disabled && createPortal(
                <div
                    ref={menuRef}
                    className="playlist-picker-menu"
                    id={pickerId}
                    role="menu"
                    aria-label="Choose a playlist"
                    style={menuPosition}
                    onKeyDown={(event) => {
                        if (event.key === "Escape") {
                            setIsOpen(false);
                            triggerRef.current?.focus();
                        }
                    }}
                >
                    <p className="playlist-picker-menu-heading">ADD SONG TO</p>
                    {playlists.map((playlist) => (
                        <button
                            key={playlist._id}
                            type="button"
                            role="menuitem"
                            className="playlist-picker-option"
                            onClick={() => choosePlaylist(playlist._id)}
                        >
                            <span className="playlist-option-art" aria-hidden="true">♫</span>
                            <span className="playlist-option-info">
                                <strong>{playlist.title || "Saved playlist"}</strong>
                                <span>
                                    {playlist.tracks?.length ?? 0}{" "}
                                    {(playlist.tracks?.length ?? 0) === 1 ? "song" : "songs"}
                                </span>
                            </span>
                            <span className="playlist-option-arrow" aria-hidden="true">↗</span>
                        </button>
                    ))}
                </div>,
                document.body,
            )}
        </div>
    );
}

function App() {
    const [query, setQuery] = useState("");
    const [songs, setSongs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [playingSong, setPlayingSong] = useState(null);
    const [playbackQueue, setPlaybackQueue] = useState([]);
    const [playbackQueueIndex, setPlaybackQueueIndex] = useState(-1);
    const [isPlayerExpanded, setIsPlayerExpanded] = useState(false);
    const [isPlaybackPaused, setIsPlaybackPaused] = useState(true);
    const [isPlayerReady, setIsPlayerReady] = useState(false);
    const [playbackMessage, setPlaybackMessage] = useState("");
    const [playerPosition, setPlayerPosition] = useState(null);
    const [isPlayerDragging, setIsPlayerDragging] = useState(false);
    const playerRef = useRef(null);
    const playerDragRef = useRef(null);
    const playerContainerRef = useRef(null);
    const youtubePlayerRef = useRef(null);
    const [savedPlaylists, setSavedPlaylists] = useState([]);
    const [showSavedPlaylists, setShowSavedPlaylists] = useState(false);
    const [playlistsLoading, setPlaylistsLoading] = useState(false);
    const [playlistsError, setPlaylistsError] = useState("");
    const [savedTracks, setSavedTracks] = useState([]);
    const [savedTracksLoading, setSavedTracksLoading] = useState(false);
    const [savedTracksError, setSavedTracksError] = useState("");
    const [addingTrackId, setAddingTrackId] = useState(null);
    const [playlistActionMessages, setPlaylistActionMessages] = useState({});
    const [newPlaylistTitle, setNewPlaylistTitle] = useState("");
    const [editingPlaylistId, setEditingPlaylistId] = useState(null);
    const [editingPlaylistTitle, setEditingPlaylistTitle] = useState("");

    const playSong = (track, queue = [track]) => {
        if (!track?.videoId) {
            return;
        }

        const playableQueue = queue.filter((item) => item?.videoId);
        setPlayingSong(track);
        setPlaybackQueue(playableQueue);
        setPlaybackQueueIndex(Math.max(0, playableQueue.findIndex((item) => item.videoId === track.videoId)));
        setIsPlayerExpanded(false);
        setIsPlaybackPaused(false);
        setIsPlayerReady(false);
        setPlaybackMessage("");
    };

    const togglePlayback = () => {
        if (!youtubePlayerRef.current) {
            setPlaybackMessage("The player is still loading.");
            return;
        }

        if (isPlaybackPaused) {
            youtubePlayerRef.current.playVideo();
        } else {
            youtubePlayerRef.current.pauseVideo();
        }
    };

    const playQueueTrack = (nextIndex) => {
        const nextTrack = playbackQueue[nextIndex];
        if (!nextTrack) {
            return;
        }

        setPlaybackQueueIndex(nextIndex);
        setPlayingSong(nextTrack);
        setIsPlaybackPaused(false);
        setIsPlayerReady(false);
        setPlaybackMessage("");
    };

    const playPreviousTrack = () => playQueueTrack(playbackQueueIndex - 1);
    const playNextTrack = () => playQueueTrack(playbackQueueIndex + 1);

    const getPlayerSize = (expanded) => {
        if (!expanded) {
            return [200, 200];
        }

        const width = Math.max(
            180,
            Math.min(1214, window.innerWidth - 72, (window.innerHeight - 160) * (16 / 9)),
        );
        return [Math.round(width), Math.round(width * (9 / 16))];
    };

    const toggleExpandedPlayer = () => {
        if (isPlayerExpanded) {
            setIsPlayerExpanded(false);
            return;
        }

        setIsPlayerExpanded(true);
    };

    const closeNowPlaying = () => {
        setIsPlayerExpanded(false);
        setPlayingSong(null);
    };

    const startPlayerDrag = (event) => {
        if (
            event.button !== 0 ||
            isPlayerExpanded ||
            event.target.closest("button, a, iframe, input, select, textarea")
        ) {
            return;
        }

        const panel = event.currentTarget;
        const bounds = panel.getBoundingClientRect();
        playerDragRef.current = {
            pointerId: event.pointerId,
            offsetX: event.clientX - bounds.left,
            offsetY: event.clientY - bounds.top,
            panel,
        };
        panel.setPointerCapture(event.pointerId);
        setPlayerPosition({ x: bounds.left, y: bounds.top });
        setIsPlayerDragging(true);
    };

    const movePlayer = (event) => {
        const drag = playerDragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) {
            return;
        }

        const bounds = drag.panel.getBoundingClientRect();
        setPlayerPosition({
            x: Math.max(0, Math.min(window.innerWidth - bounds.width, event.clientX - drag.offsetX)),
            y: Math.max(0, Math.min(window.innerHeight - bounds.height, event.clientY - drag.offsetY)),
        });
    };

    const stopPlayerDrag = (event) => {
        if (playerDragRef.current?.pointerId !== event.pointerId) {
            return;
        }

        playerDragRef.current = null;
        setIsPlayerDragging(false);
    };

    useEffect(() => {
        const keepPlayerOnScreen = () => {
            const panel = playerRef.current;
            if (!panel) {
                return;
            }

            const bounds = panel.getBoundingClientRect();
            setPlayerPosition((position) => {
                if (!position) {
                    return position;
                }

                return {
                    x: Math.max(0, Math.min(window.innerWidth - bounds.width, position.x)),
                    y: Math.max(0, Math.min(window.innerHeight - bounds.height, position.y)),
                };
            });
        };

        window.addEventListener("resize", keepPlayerOnScreen);
        return () => window.removeEventListener("resize", keepPlayerOnScreen);
    }, []);

    useEffect(() => {
        if (!playingSong?.videoId) {
            return undefined;
        }

        let cancelled = false;
        const playerContainer = playerContainerRef.current;
        setIsPlayerReady(false);
        setPlaybackMessage("Loading player…");
        loadYouTubeIframeApi()
            .then((youtube) => {
                if (cancelled || !playerContainer) {
                    return;
                }

                const playerTarget = document.createElement("div");
                playerContainer.replaceChildren(playerTarget);

                youtubePlayerRef.current = new youtube.Player(playerTarget, {
                    width: "200",
                    height: "200",
                    videoId: playingSong.videoId,
                    playerVars: {
                        autoplay: 1,
                        enablejsapi: 1,
                        playsinline: 1,
                        controls: 0,
                        origin: window.location.origin,
                    },
                    events: {
                        onReady: (event) => {
                            setIsPlayerReady(true);
                            setPlaybackMessage("");
                            const isExpanded = playerContainer.parentElement?.classList.contains("is-expanded");
                            event.target.setSize(...getPlayerSize(isExpanded));
                            event.target.playVideo();
                        },
                        onStateChange: (event) => {
                            if (event.data === youtube.PlayerState.PLAYING) {
                                setIsPlaybackPaused(false);
                                setPlaybackMessage("");
                            } else if (
                                event.data === youtube.PlayerState.PAUSED ||
                                event.data === youtube.PlayerState.ENDED
                            ) {
                                setIsPlaybackPaused(true);
                            }
                        },
                        onError: (event) => {
                            console.error("YouTube player error:", event.data);
                            setIsPlaybackPaused(true);
                            setIsPlayerReady(false);
                            setPlaybackMessage(
                                "This video is unavailable for in-app playback. Try another song.",
                            );
                        },
                        onAutoplayBlocked: () => {
                            setIsPlaybackPaused(true);
                            setPlaybackMessage("Press play in the video to start playback.");
                        },
                    },
                });
            })
            .catch((error) => {
                console.error("Could not load YouTube player:", error);
                if (!cancelled) {
                    setIsPlaybackPaused(true);
                    setPlaybackMessage("Could not load the in-app player.");
                }
            });

        return () => {
            cancelled = true;
            setIsPlayerReady(false);
            youtubePlayerRef.current?.destroy();
            youtubePlayerRef.current = null;
            playerContainer?.replaceChildren();
        };
    }, [playingSong]);

    useEffect(() => {
        youtubePlayerRef.current?.setSize(...getPlayerSize(isPlayerExpanded));
    }, [isPlayerExpanded]);

    useEffect(() => {
        if (!isPlayerExpanded) {
            return undefined;
        }

        const resizePlayer = () => {
            youtubePlayerRef.current?.setSize(...getPlayerSize(true));
        };
        window.addEventListener("resize", resizePlayer);
        return () => window.removeEventListener("resize", resizePlayer);
    }, [isPlayerExpanded]);

    const getVibe = async () => {
        setLoading(true);
        try {
            const response = await axios.post(
                `${API_BASE_URL}/api/recommend`,
                { songName: query },
            );
            setSongs([response.data.seed, ...response.data.tracks]);
            setPlayingSong(null);
        } catch (error) {
            console.error("Error fetching data:", error);
            alert("Could not reach the music API. Check the backend URL and try again.");
        } finally {
            setLoading(false);
        }
    };

    const savePlaylist = async () => {
        try {
            await axios.post(`${API_BASE_URL}/api/save`, {
                title: `Vibe for ${query}`,
                tracks: songs,
            });
            await loadSavedPlaylists();
            alert("Playlist saved to MongoDB!");
        } catch (error) {
            console.error("Error saving playlist:", error);
            alert("Error saving playlist");
        }
    };

    const loadSavedPlaylists = async () => {
        setPlaylistsLoading(true);
        setPlaylistsError("");
        try {
            const response = await axios.get(`${API_BASE_URL}/api/playlists`);
            setSavedPlaylists(response.data);
        } catch (error) {
            console.error("Error loading saved playlists:", error);
            setPlaylistsError("Could not load saved playlists. Make sure the backend is running.");
        } finally {
            setPlaylistsLoading(false);
        }
    };

    const loadSavedTracks = async () => {
        setSavedTracksLoading(true);
        setSavedTracksError("");
        try {
            const response = await axios.get(`${API_BASE_URL}/api/saved-tracks`);
            setSavedTracks(response.data);
        } catch (error) {
            console.error("Error loading saved songs:", error);
            setSavedTracksError("Could not load saved songs. Make sure the backend is running.");
        } finally {
            setSavedTracksLoading(false);
        }
    };

    const saveTrack = async (track) => {
        try {
            await axios.post(`${API_BASE_URL}/api/saved-tracks`, { track });
            await loadSavedTracks();
        } catch (error) {
            console.error("Error saving track:", error);
            alert("Could not save this song.");
        }
    };

    const removeSavedTrack = async (videoId) => {
        try {
            await axios.delete(
                `${API_BASE_URL}/api/saved-tracks/${encodeURIComponent(videoId)}`,
            );
            setSavedTracks((currentTracks) =>
                currentTracks.filter((track) => track.videoId !== videoId),
            );
        } catch (error) {
            console.error("Error removing saved song:", error);
            alert("Could not remove this song from your saved songs.");
        }
    };

    const removePlaylistTrack = async (playlistId, videoId) => {
        try {
            const response = await axios.delete(
                `${API_BASE_URL}/api/playlists/${playlistId}/tracks/${encodeURIComponent(videoId)}`,
            );
            setSavedPlaylists((currentPlaylists) =>
                currentPlaylists.map((playlist) =>
                    playlist._id === playlistId ? response.data : playlist,
                ),
            );
        } catch (error) {
            console.error("Error removing song from playlist:", error);
            alert("Could not remove this song from the playlist.");
        }
    };

    const addTrackToPlaylist = async (playlistId, track) => {
        setAddingTrackId(track.videoId);
        setPlaylistActionMessages((messages) => ({ ...messages, [track.videoId]: "" }));
        try {
            const response = await axios.post(
                `${API_BASE_URL}/api/playlists/${playlistId}/tracks`,
                { track },
            );
            setSavedPlaylists((currentPlaylists) =>
                currentPlaylists.map((playlist) =>
                    playlist._id === playlistId ? response.data : playlist,
                ),
            );
            setPlaylistActionMessages((messages) => ({
                ...messages,
                [track.videoId]: `Added to ${response.data.title || "playlist"}`,
            }));
        } catch (error) {
            console.error("Error adding song to playlist:", error);
            setPlaylistActionMessages((messages) => ({
                ...messages,
                [track.videoId]: "Could not add this song to the playlist.",
            }));
        } finally {
            setAddingTrackId(null);
        }
    };

    const createPlaylist = async (event) => {
        event.preventDefault();
        if (!newPlaylistTitle.trim()) {
            return;
        }

        try {
            const response = await axios.post(`${API_BASE_URL}/api/playlists`, {
                title: newPlaylistTitle.trim(),
            });
            setSavedPlaylists((currentPlaylists) => [response.data, ...currentPlaylists]);
            setNewPlaylistTitle("");
        } catch (error) {
            console.error("Error creating playlist:", error);
            alert("Could not create the playlist.");
        }
    };

    const renamePlaylist = async (playlistId) => {
        if (!editingPlaylistTitle.trim()) {
            alert("Enter a playlist name.");
            return;
        }

        try {
            const response = await axios.patch(
                `${API_BASE_URL}/api/playlists/${playlistId}`,
                { title: editingPlaylistTitle.trim() },
            );
            setSavedPlaylists((currentPlaylists) =>
                currentPlaylists.map((playlist) =>
                    playlist._id === playlistId ? response.data : playlist,
                ),
            );
            setEditingPlaylistId(null);
            setEditingPlaylistTitle("");
        } catch (error) {
            console.error("Error renaming playlist:", error);
            alert("Could not rename the playlist.");
        }
    };

    const deletePlaylist = async (playlist) => {
        if (!window.confirm(`Delete "${playlist.title}" and all its songs?`)) {
            return;
        }

        try {
            await axios.delete(`${API_BASE_URL}/api/playlists/${playlist._id}`);
            setSavedPlaylists((currentPlaylists) =>
                currentPlaylists.filter((item) => item._id !== playlist._id),
            );
        } catch (error) {
            console.error("Error deleting playlist:", error);
            alert("Could not delete the playlist.");
        }
    };

    const toggleSavedPlaylists = async () => {
        const shouldShow = !showSavedPlaylists;
        setShowSavedPlaylists(shouldShow);
        if (shouldShow) {
            await Promise.all([loadSavedPlaylists(), loadSavedTracks()]);
        }
    };

    return (
        <main className="app-shell">
            <div className="ambient-glow" aria-hidden="true" />
            <header className="topbar">
                <a className="brand" href="/" aria-label="Vibe home">
                    <span className="brand-mark">V</span>
                    <span>vibe<span className="brand-dot">.</span></span>
                </a>
                <div className="topbar-note">
                    <span className="status-dot" />
                    Your soundtrack, rediscovered
                </div>
                <button
                    type="button"
                    onClick={toggleSavedPlaylists}
                    className={`button button--library${showSavedPlaylists ? " is-active" : ""}`}
                >
                    <span aria-hidden="true">♫</span>
                    {showSavedPlaylists ? "Close library" : "Your library"}
                    {savedPlaylists.length > 0 && (
                        <span className="library-count">{savedPlaylists.length}</span>
                    )}
                </button>
            </header>

            <section className="hero-section">
                <div className="hero-copy">
                    <span className="eyebrow"><span /> MUSIC FOR YOUR MOMENT</span>
                    <h1>Find your next<br /><span>favorite vibe.</span></h1>
                    <p>Start with a song you love. We’ll find the sounds that belong next to it.</p>
                </div>

                <form
                    className="search-panel"
                    onSubmit={(event) => {
                        event.preventDefault();
                        void getVibe();
                    }}
                >
                    <label className="search-box">
                        <span className="search-icon" aria-hidden="true">⌕</span>
                        <input
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Search a song, artist, or mood"
                            aria-label="Search a song, artist, or mood"
                        />
                        {query && (
                            <button
                                type="button"
                                className="clear-search"
                                onClick={() => setQuery("")}
                                aria-label="Clear search"
                            >
                                <svg viewBox="0 0 24 24" aria-hidden="true">
                                    <path d="m6 6 12 12M18 6 6 18" />
                                </svg>
                            </button>
                        )}
                    </label>
                    <button className="button button--search" type="submit" disabled={loading}>
                        {loading ? <><span className="button-spinner" /> Finding vibes</> : <>Find my vibe <span aria-hidden="true">→</span></>}
                    </button>
                </form>

                <div className="hero-tags" aria-label="Discovery features">
                    <span>Curated for you</span>
                    <span>Related tracks</span>
                    <span>Save your favorites</span>
                </div>
            </section>

            <div className="page-content">
                {songs.length > 0 && (
                    <div className="results-toolbar">
                        <div>
                            <span className="eyebrow eyebrow--small">YOUR DISCOVERY</span>
                            <p>{songs.length} tracks picked from your search</p>
                        </div>
                        <button
                            type="button"
                            onClick={savePlaylist}
                            disabled={songs.length === 0}
                            className="button button--secondary"
                        >
                            <span aria-hidden="true">＋</span> Save as playlist
                        </button>
                    </div>
                )}

                {showSavedPlaylists && (
                    <section className="library-section" aria-labelledby="library-heading">
                        <div className="section-heading">
                            <div>
                                <span className="eyebrow eyebrow--small">YOUR COLLECTION</span>
                                <h2 id="library-heading">Your library</h2>
                            </div>
                            <span className="section-count">
                                {savedPlaylists.length} {savedPlaylists.length === 1 ? "playlist" : "playlists"}
                            </span>
                        </div>

                        <div className="create-playlist-panel">
                            <div>
                                <h3>Create a playlist</h3>
                                <p>Give a collection of songs a name.</p>
                            </div>
                            <form onSubmit={createPlaylist} className="create-playlist-form">
                                <input
                                    value={newPlaylistTitle}
                                    onChange={(event) => setNewPlaylistTitle(event.target.value)}
                                    placeholder="e.g. Late night drive"
                                    aria-label="New playlist name"
                                    maxLength={100}
                                    required
                                />
                                <button className="button button--create" type="submit">
                                    <span aria-hidden="true">＋</span> Create playlist
                                </button>
                            </form>
                        </div>

                        {playlistsLoading && <p className="inline-state">Loading your playlists…</p>}
                        {playlistsError && <p className="inline-state inline-state--error" role="alert">{playlistsError}</p>}
                        {!playlistsLoading && !playlistsError && savedPlaylists.length === 0 && (
                            <div className="empty-state">
                                <span className="empty-state-icon" aria-hidden="true">♫</span>
                                <h3>Your playlists start here</h3>
                                <p>Create a new playlist above, or save a discovery after searching.</p>
                            </div>
                        )}

                        <div className="playlist-grid">
                            {!playlistsLoading && savedPlaylists.map((playlist) => (
                                <article className="playlist-card" key={playlist._id}>
                                    <div className="playlist-card-art" aria-hidden="true">
                                        <span>♫</span>
                                    </div>
                                    <div className="playlist-card-content">
                                        <div className="playlist-card-heading">
                                            <div className="playlist-title-wrap">
                                                {editingPlaylistId === playlist._id ? (
                                                    <form
                                                        className="rename-form"
                                                        onSubmit={(event) => {
                                                            event.preventDefault();
                                                            void renamePlaylist(playlist._id);
                                                        }}
                                                    >
                                                        <input
                                                            value={editingPlaylistTitle}
                                                            onChange={(event) => setEditingPlaylistTitle(event.target.value)}
                                                            aria-label="Renamed playlist title"
                                                            maxLength={100}
                                                            required
                                                            autoFocus
                                                        />
                                                        <button type="submit" className="text-button">Save</button>
                                                        <button
                                                            type="button"
                                                            className="text-button"
                                                            onClick={() => setEditingPlaylistId(null)}
                                                        >
                                                            Cancel
                                                        </button>
                                                    </form>
                                                ) : (
                                                    <h3>{playlist.title || "Saved playlist"}</h3>
                                                )}
                                                <p className="playlist-meta">
                                                    {playlist.tracks?.length ?? 0} songs
                                                    <span>·</span>
                                                    {playlist.createdAt
                                                        ? new Date(playlist.createdAt).toLocaleDateString()
                                                        : "Recently created"}
                                                </p>
                                            </div>
                                            {editingPlaylistId !== playlist._id && (
                                                <div className="playlist-management">
                                                    <button
                                                        type="button"
                                                        className="text-button"
                                                        onClick={() => {
                                                            setEditingPlaylistId(playlist._id);
                                                            setEditingPlaylistTitle(playlist.title || "");
                                                        }}
                                                    >
                                                        Rename
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => void deletePlaylist(playlist)}
                                                        className="playlist-action-button playlist-action-button--delete"
                                                        aria-label={`Delete playlist ${playlist.title}`}
                                                    >
                                                        <span aria-hidden="true">×</span> Delete
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        {playlist.tracks?.length > 0 ? (
                                            <div className="playlist-track-list">
                                                {playlist.tracks.map((track, index) => (
                                                    <div
                                                        className="playlist-track-row"
                                                        key={`${track.videoId ?? track.name}-${index}`}
                                                    >
                                                        <span className="track-index">{String(index + 1).padStart(2, "0")}</span>
                                                        <div className="playlist-track-info">
                                                            <strong>{track.name ?? "Unknown title"}</strong>
                                                            <span>{track.artist?.name ?? "Unknown artist"}</span>
                                                        </div>
                                                        {track.videoId && (
                                                            <div className="playlist-track-actions">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => playSong(track, playlist.tracks)}
                                                                    className="icon-button icon-button--play"
                                                                    aria-label={`Play ${track.name ?? "song"}`}
                                                                >
                                                                    ▶
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => removePlaylistTrack(playlist._id, track.videoId)}
                                                                    className="icon-button icon-button--remove"
                                                                    aria-label={`Remove ${track.name ?? "song"} from ${playlist.title}`}
                                                                >
                                                                    <svg viewBox="0 0 24 24" aria-hidden="true">
                                                                        <path d="m6 6 12 12M18 6 6 18" />
                                                                    </svg>
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="playlist-empty">This playlist is waiting for its first song.</p>
                                        )}
                                    </div>
                                </article>
                            ))}
                        </div>

                        <div className="saved-songs-section">
                            <div className="section-heading section-heading--compact">
                                <div>
                                    <span className="eyebrow eyebrow--small">YOUR FAVORITES</span>
                                    <h2>Saved songs</h2>
                                </div>
                                <span className="section-count">{savedTracks.length} tracks</span>
                            </div>
                            {savedTracksLoading && <p className="inline-state">Loading saved songs…</p>}
                            {savedTracksError && <p className="inline-state inline-state--error" role="alert">{savedTracksError}</p>}
                            {!savedTracksLoading && !savedTracksError && savedTracks.length === 0 && (
                                <p className="muted-copy">Save songs from your discoveries and they’ll show up here.</p>
                            )}
                            <div className="track-list">
                                {!savedTracksLoading && savedTracks.map((track) => (
                                    <div className="track-card track-card--saved" key={track.videoId}>
                                        <div className="track-art">
                                            {track.thumbnails?.[0]?.url
                                                ? <img src={track.thumbnails[0].url} alt="" />
                                                : <span aria-hidden="true">♫</span>}
                                        </div>
                                        <div className="track-info">
                                            <strong>{track.name ?? "Unknown title"}</strong>
                                            <span>{track.artist?.name ?? "Unknown artist"}</span>
                                        </div>
                                        <div className="track-card-actions">
                                            {savedPlaylists.length > 0 && (
                                                <PlaylistPicker
                                                    playlists={savedPlaylists}
                                                    label={`Add ${track.name ?? "song"} to a playlist`}
                                                    onSelect={(playlistId) => void addTrackToPlaylist(playlistId, track)}
                                                />
                                            )}
                                            <div className="track-card-action-row">
                                                <button
                                                    type="button"
                                                    onClick={() => removeSavedTrack(track.videoId)}
                                                    className="track-action-button track-action-button--remove"
                                                >
                                                    Remove
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => playSong(track, savedTracks)}
                                                    className="track-action-button track-action-button--play"
                                                >
                                                    Play
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </section>
                )}

                {songs.length > 0 && (
                    <section className="results-section" aria-labelledby="results-heading">
                        <div className="section-heading">
                            <div>
                                <span className="eyebrow eyebrow--small">MADE FOR YOUR SEARCH</span>
                                <h2 id="results-heading">Your next rotation</h2>
                            </div>
                            <span className="section-count">{songs.length} tracks</span>
                        </div>
                        <div className="track-list">
                            {songs.map((track) => (
                                <article className="track-card" key={track.videoId ?? track.name}>
                                    <div className="track-art">
                                        {track.thumbnails?.[0]?.url
                                            ? <img src={track.thumbnails[0].url} alt="" />
                                            : <span aria-hidden="true">♫</span>}
                                    </div>
                                    <div className="track-info">
                                        <strong>{track.name ?? "Unknown title"}</strong>
                                        <span>{track.artist?.name ?? "Unknown artist"}</span>
                                        {playlistActionMessages[track.videoId] && (
                                            <span
                                                className={`track-feedback${playlistActionMessages[track.videoId].startsWith("Could not") ? " is-error" : ""}`}
                                                role="status"
                                            >
                                                {playlistActionMessages[track.videoId]}
                                            </span>
                                        )}
                                    </div>
                                    {track.videoId && (
                                        <div className="track-card-actions">
                                            {savedPlaylists.length > 0 && (
                                                <PlaylistPicker
                                                    playlists={savedPlaylists}
                                                    label={`Add ${track.name ?? "song"} to a playlist`}
                                                    disabled={addingTrackId === track.videoId}
                                                    onSelect={(playlistId) => void addTrackToPlaylist(playlistId, track)}
                                                />
                                            )}
                                            <div className="track-card-action-row">
                                                {savedTracks.some((savedTrack) => savedTrack.videoId === track.videoId) ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => removeSavedTrack(track.videoId)}
                                                        className="track-action-button track-action-button--remove"
                                                    >
                                                        Remove
                                                    </button>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() => saveTrack(track)}
                                                        className="track-action-button track-action-button--save"
                                                    >
                                                        Save
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => playSong(track, songs)}
                                                    className="track-action-button track-action-button--play"
                                                >
                                                    {playingSong?.videoId === track.videoId ? "Playing" : "Play"}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </article>
                            ))}
                        </div>
                    </section>
                )}

                {!songs.length && !showSavedPlaylists && (
                    <section className="welcome-panel">
                        <div className="welcome-art" aria-hidden="true">
                            <span className="sound-wave sound-wave--one" />
                            <span className="sound-wave sound-wave--two" />
                            <span className="sound-wave sound-wave--three" />
                            <span className="welcome-note">♫</span>
                        </div>
                        <div className="welcome-copy">
                            <span className="eyebrow eyebrow--small">A LITTLE INSPIRATION</span>
                            <h2>One song can take you anywhere.</h2>
                            <p>Search a track above to uncover a fresh collection of songs with the same energy.</p>
                        </div>
                    </section>
                )}
            </div>

            {playingSong && (
                <aside
                    ref={playerRef}
                    className={`now-playing${isPlayerExpanded ? " is-expanded" : ""}${playerPosition && !isPlayerExpanded ? " is-positioned" : ""}${isPlayerDragging ? " is-dragging" : ""}`}
                    aria-label="Selected song"
                    style={playerPosition && !isPlayerExpanded ? {
                        left: `${playerPosition.x}px`,
                        top: `${playerPosition.y}px`,
                        right: "auto",
                        bottom: "auto",
                        transform: "none",
                    } : undefined}
                    onPointerDown={startPlayerDrag}
                    onPointerMove={movePlayer}
                    onPointerUp={stopPlayerDrag}
                    onPointerCancel={stopPlayerDrag}
                >
                    <div className="now-playing-info">
                        <button
                            type="button"
                            className="now-playing-art"
                            onClick={toggleExpandedPlayer}
                            aria-label={isPlayerExpanded ? "Collapse video player" : "Expand video player"}
                            title={isPlayerExpanded ? "Collapse video" : "Expand video"}
                        >
                            {playingSong.thumbnails?.[0]?.url ? (
                                <img
                                    src={playingSong.thumbnails[0].url}
                                    alt=""
                                />
                            ) : (
                                <span aria-hidden="true">♫</span>
                            )}
                        </button>
                        <span className="now-playing-indicator"><i /><i /><i /></span>
                        <div className="now-playing-copy">
                            <span className="eyebrow eyebrow--small">NOW PLAYING</span>
                            <strong>{playingSong.name ?? "Unknown title"}</strong>
                            <span>{playingSong.artist?.name ?? "Unknown artist"}</span>
                        </div>
                        <div className="player-transport">
                            <button
                                type="button"
                                className="player-skip"
                                onClick={playPreviousTrack}
                                disabled={playbackQueueIndex <= 0}
                                aria-label="Play previous song"
                                title="Previous"
                            >
                                <svg viewBox="0 0 24 24" aria-hidden="true">
                                    <path d="M6 5v14M19 5 9 12l10 7V5Z" />
                                </svg>
                            </button>
                            <button
                                type="button"
                                className="player-toggle"
                                onClick={togglePlayback}
                                aria-label={isPlaybackPaused ? "Resume playback" : "Pause playback"}
                                title={isPlaybackPaused ? "Play" : "Pause"}
                                disabled={!isPlayerReady}
                            >
                                {isPlaybackPaused ? (
                                    <svg viewBox="0 0 24 24" aria-hidden="true">
                                        <path d="m8 5 12 7-12 7V5Z" />
                                    </svg>
                                ) : (
                                    <svg viewBox="0 0 24 24" aria-hidden="true">
                                        <path d="M8 5h3v14H8zM15 5h3v14h-3z" />
                                    </svg>
                                )}
                            </button>
                            <button
                                type="button"
                                className="player-skip"
                                onClick={playNextTrack}
                                disabled={playbackQueueIndex >= playbackQueue.length - 1}
                                aria-label="Play next song"
                                title="Next"
                            >
                                <svg viewBox="0 0 24 24" aria-hidden="true">
                                    <path d="M18 5v14M5 5l10 7-10 7V5Z" />
                                </svg>
                            </button>
                        </div>
                        <button
                            type="button"
                            className="player-expand"
                            onClick={toggleExpandedPlayer}
                            aria-label={isPlayerExpanded ? "Collapse video player" : "Expand video player"}
                            aria-expanded={isPlayerExpanded}
                            title={isPlayerExpanded ? "Collapse video" : "Show video"}
                        >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                                {isPlayerExpanded ? (
                                    <path d="m6 9 6 6 6-6" />
                                ) : (
                                    <path d="m6 15 6-6 6 6" />
                                )}
                            </svg>
                        </button>
                    </div>
                    <div className={`player-controls${isPlayerExpanded ? " is-expanded" : ""}`}>
                        <div
                            key={playingSong.videoId}
                            ref={playerContainerRef}
                            className="player-frame"
                            aria-label={`Player for ${playingSong.name ?? "song"}`}
                        />
                        {playbackMessage && (
                            <p className="player-status" role="status">{playbackMessage}</p>
                        )}
                    </div>
                    <button
                        type="button"
                        className="player-close"
                        onClick={closeNowPlaying}
                        aria-label="Close player"
                    >
                        ×
                    </button>
                </aside>
            )}

            <footer className="site-footer">
                <span className="footer-brand">vibe<span className="brand-dot">.</span></span>
                <span>Good music finds its way.</span>
            </footer>
        </main>
    );
}

export default App;
