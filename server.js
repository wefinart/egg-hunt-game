const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

const PORT = 4001;

// =====================
// CONFIG
// =====================
const MAX_PLAYERS = 20;
const GAME_DURATION = 10 * 60; // 10 dk (sn)

// rooms = {
//   roomId: {
//     players: Map,
//     eggs: [],
//     startTime,
//     interval
//   }
// }
const rooms = new Map();

// =====================
// STATIC FILES
// =====================
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// =====================
// SOCKET
// =====================
io.on("connection", (socket) => {
  console.log("🔌 Client bağlandı:", socket.id);

  socket.on("joinRoom", ({ roomId, nick, avatar }) => {
    if (!rooms.has(roomId)) {
      createRoom(roomId);
    }

    const room = rooms.get(roomId);

    if (room.players.size >= MAX_PLAYERS) {
      socket.emit("roomFull");
      return;
    }

    const player = {
      id: socket.id,
      nick,
      avatar,
      x: Math.random() * 5000,
      y: Math.random() * 3000,
      eggs: 0
    };

    room.players.set(socket.id, player);
    socket.join(roomId);

    socket.emit("init", {
      id: socket.id,
      players: [...room.players.values()],
      eggs: room.eggs,
      timeLeft: getTimeLeft(room)
    });

    socket.to(roomId).emit("playerJoined", player);
  });

  socket.on("move", ({ roomId, x, y }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    const p = room.players.get(socket.id);
    if (!p) return;

    p.x = x;
    p.y = y;

    socket.to(roomId).emit("playerMoved", {
      id: socket.id,
      x,
      y
    });
  });

  socket.on("pickupEgg", ({ roomId, eggId }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    const egg = room.eggs.find(e => e.id === eggId);
    if (!egg || egg.taken) return;

    egg.taken = true;

    const p = room.players.get(socket.id);
    if (p) p.eggs++;

    io.to(roomId).emit("eggTaken", {
      eggId,
      playerId: socket.id
    });
  });

  socket.on("disconnect", () => {
    for (const [roomId, room] of rooms) {
      if (room.players.has(socket.id)) {
        room.players.delete(socket.id);
        io.to(roomId).emit("playerLeft", socket.id);

        if (room.players.size === 0) {
          clearInterval(room.interval);
          rooms.delete(roomId);
        }
      }
    }
  });
});

// =====================
// ROOM LOGIC
// =====================
function createRoom(roomId) {
  const eggs = [];

  for (let i = 0; i < 1000; i++) {
    eggs.push({
      id: i,
      x: Math.random() * 8000,
      y: Math.random() * 5000,
      taken: false
    });
  }

  const room = {
    players: new Map(),
    eggs,
    startTime: Date.now(),
    interval: null
  };

  room.interval = setInterval(() => {
    const elapsed = (Date.now() - room.startTime) / 1000;

    if (elapsed >= GAME_DURATION) {
      io.to(roomId).emit("gameOver", {
        players: [...room.players.values()]
      });
      clearInterval(room.interval);
      rooms.delete(roomId);
    }
  }, 1000);

  rooms.set(roomId, room);
}

function getTimeLeft(room) {
  const elapsed = (Date.now() - room.startTime) / 1000;
  return Math.max(0, GAME_DURATION - Math.floor(elapsed));
}

// =====================
server.listen(PORT, () => {
  console.log("🚀 Egg Hunt Server aktif:", PORT);
});
