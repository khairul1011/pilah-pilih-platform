import { io } from "socket.io-client";

// Get base URL without /api at the end for socket
const getBaseUrl = () => {
    // If running on local development
    return import.meta.env.VITE_SOCKET_URL || "https://backend-production-f1e1.up.railway.app";
};

const socket = io(getBaseUrl(), {
    autoConnect: false, // We'll connect manually when user is authenticated
    transports: ['polling', 'websocket'], // Prioritize polling first as fallback for Azure
});

export default socket;
