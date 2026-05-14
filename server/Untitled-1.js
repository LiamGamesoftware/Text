const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

const connectedUsers = {};

io.on("connection", (socket) => {
  console.log("Connected:", socket.id);  

  socket.on("register", (email) => {
    connectedUsers[email] = socket.id;
    console.log(email + " registered");
  });

  socket.on("send_message", (msg) => {
    const target = connectedUsers[msg.to];

    if (target) {
      io.to(target).emit("receive_message", msg);
    }

    socket.emit("receive_message", msg);
  });

  socket.on("disconnect", () => {
    console.log("Disconnected");
  });
});

app.get("/", (req, res) => {
  res.send("Liam Chats server running");
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});