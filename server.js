const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PORT = 4001;
const MAX_PLAYERS = 20;
const GAME_DURATION = 600; // 10 dk

const rooms = new Map();

app.use(express.static(path.join(__dirname, "public")));
app.get("/", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "index.html"))
);

io.on("connection", socket => {

  socket.on("joinRoom", ({ roomId, nick, avatar }) => {
    if (!rooms.has(roomId)) createRoom(roomId);
    const room = rooms.get(roomId);

    if (room.players.size >= MAX_PLAYERS) return;

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

    socket.to(roomId).emit("playerMoved", p);
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

function createRoom(roomId) {
  const eggs = Array.from({ length: 1000 }, (_, i) => ({
    id: i,
    x: Math.random() * 8000,
    y: Math.random() * 5000,
    taken: false
  }));

  const room = {
    players: new Map(),
    eggs,
    startTime: Date.now(),
    interval: null
  };

  room.interval = setInterval(() => {
    const timeLeft = getTimeLeft(room);
    io.to(roomId).emit("tick", timeLeft);

    if (timeLeft <= 0) {
      io.to(roomId).emit("gameOver");
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

server.listen(PORT, () =>
  console.log("🚀 Server aktif:", PORT)
);
