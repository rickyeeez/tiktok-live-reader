import express from "express";
import http from "http";
import { Server } from "socket.io";
import WebSocket from "ws";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [
      "https://tiktok-live-reader.vercel.app", // frontend kamu di Vercel
      "http://localhost:3000", // kalau test lokal
    ],
    methods: ["GET", "POST"],
  },
});

app.use(express.static("public"));

// Data koneksi EulerStream (hanya satu koneksi global)
let ws = null;
let isConnected = false;
let currentUniqueId = null;

// Konfigurasi
const apiKey =
  "euler_NmJjYmEwYjZlMGMyMmM5MGZiOWI5NzliZTRiZDQ2MzgyMjFlNGM4MGU0OWQzMjVkMDUyZDY2";

// Function to connect to EulerStream
function connectToEulerStream(uniqueId) {
  if (ws) {
    ws.close();
  }

  console.log(`🔌 Connecting to EulerStream with uniqueId: ${uniqueId}`);
  io.emit("status", {
    type: "connecting",
    message: `Connecting to ${uniqueId}...`,
  });

  ws = new WebSocket(
    `wss://ws.eulerstream.com?uniqueId=${uniqueId}&apiKey=${apiKey}`
  );

  ws.on("open", () => {
    console.log("✅ Connected to EulerStream WebSocket");
    isConnected = true;
    currentUniqueId = uniqueId;
    io.emit("status", {
      type: "success",
      message: `Successfully connected to ${uniqueId}`,
    });
  });

  ws.on("message", (data) => {
    try {
      const event = JSON.parse(data.toString());
      if (event.messages && Array.isArray(event.messages)) {
        const chatMessages = event.messages.filter(
          (msg) => msg.type === "WebcastChatMessage"
        );
        if (chatMessages.length > 0) {
          // Kirim chat ke semua client yang terhubung
          io.emit("chat_messages", chatMessages);
        }
      }
    } catch (err) {
      console.error("❌ Error parsing WebSocket message:", err);
      io.emit("status", {
        type: "error",
        message: "Error parsing message from TikTok",
      });
    }
  });

  ws.on("close", (code, reason) => {
    console.log(`🔒 WebSocket closed: code=${code}, reason=${reason}`);
    isConnected = false;
    currentUniqueId = null;
    io.emit("status", {
      type: "error",
      message: `Connection closed: ${reason || "Unknown reason"}`,
    });
    ws = null;
  });

  ws.on("error", (err) => {
    console.error("⚠️ WebSocket error:", err.message);
    isConnected = false;
    io.emit("status", {
      type: "error",
      message: `Connection error: ${err.message}`,
    });
  });
}

// Ketika client baru terhubung ke Socket.IO
io.on("connection", (socket) => {
  console.log("👤 Client connected:", socket.id);

  // Send current status to new client
  if (isConnected && currentUniqueId) {
    socket.emit("status", {
      type: "success",
      message: `Connected to ${currentUniqueId}`,
    });
  } else if (currentUniqueId) {
    socket.emit("status", {
      type: "connecting",
      message: `Connecting to ${currentUniqueId}...`,
    });
  } else {
    socket.emit("status", {
      type: "info",
      message: "Enter a TikTok username to start",
    });
  }

  // Handle connect request from client
  socket.on("connect_to_user", (data) => {
    const { uniqueId } = data;
    if (!uniqueId || uniqueId.trim() === "") {
      socket.emit("status", {
        type: "error",
        message: "Please enter a valid TikTok username",
      });
      return;
    }

    connectToEulerStream(uniqueId.trim());
  });

  // Ketika client disconnect
  socket.on("disconnect", () => {
    console.log("❌ Client disconnected:", socket.id);

    // Jika tidak ada client aktif, putuskan koneksi EulerStream
    if (io.engine.clientsCount === 0 && ws) {
      console.log("🧹 No clients left. Closing EulerStream connection...");
      ws.close();
      ws = null;
      isConnected = false;
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
