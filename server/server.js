const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

// Data storage file
const dataFile = path.join(__dirname, "data.json");

// In-memory data structure
let data = {
  users: {},
  conversations: {}
};

// Load data from file on startup
function loadData() {
  try {
    if (fs.existsSync(dataFile)) {
      const fileData = fs.readFileSync(dataFile, "utf-8");
      data = JSON.parse(fileData);
      console.log("Data loaded from file");
    }
  } catch (err) {
    console.error("Error loading data:", err);
    data = { users: {}, conversations: {} };
  }
}

// Save data to file
function saveData() {
  try {
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Error saving data:", err);
  }
}

// Load data on startup
loadData();

// Track connected users
const connectedUsers = {};

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Register user (called when user logs in)
  socket.on("register_user", (email) => {
    connectedUsers[email] = socket.id;
    console.log(`${email} registered with socket ${socket.id}`);
  });

  // Get user contacts and conversation data
  socket.on("load_user_data", (email) => {
    const userContacts = data.users[email]?.contacts || [];
    const conversations = {};

    userContacts.forEach(contactEmail => {
      const convKey = [email, contactEmail].sort().join("~~~");
      conversations[convKey] = data.conversations[convKey] || [];
    });

    socket.emit("user_data_loaded", {
      contacts: userContacts,
      conversations: conversations
    });
  });

  // Save user contacts
  socket.on("save_contacts", (payload) => {
    const { email, contacts } = payload;
    if (!data.users[email]) {
      data.users[email] = {};
    }
    data.users[email].contacts = contacts;
    saveData();
    console.log(`Contacts saved for ${email}`);
  });

  // Save messages for a conversation
  socket.on("save_messages", (payload) => {
    const { email1, email2, messages } = payload;
    const convKey = [email1, email2].sort().join("~~~");
    data.conversations[convKey] = messages;
    saveData();
    console.log(`Messages saved for conversation ${convKey}`);
  });

  // Send message to another user
  socket.on("send_message", (payload) => {
    const { from, to, message } = payload;
    const convKey = [from, to].sort().join("~~~");

    // Save message to data
    if (!data.conversations[convKey]) {
      data.conversations[convKey] = [];
    }
    data.conversations[convKey].push(message);
    saveData();

    // Emit to recipient if connected
    const recipientSocket = connectedUsers[to];
    if (recipientSocket) {
      io.to(recipientSocket).emit("receive_message", {
        from,
        message,
        convKey
      });
    }

    // Emit back to sender
    socket.emit("message_sent", {
      from,
      to,
      message
    });
  });

  // Add contact (mutual)
  socket.on("add_contact_mutual", (payload) => {
    const { myEmail, contactEmail } = payload;

    // Add to my contacts
    if (!data.users[myEmail]) {
      data.users[myEmail] = { contacts: [] };
    }
    if (!data.users[myEmail].contacts) {
      data.users[myEmail].contacts = [];
    }
    if (!data.users[myEmail].contacts.includes(contactEmail)) {
      data.users[myEmail].contacts.push(contactEmail);
    }

    // Add me to their contacts
    if (!data.users[contactEmail]) {
      data.users[contactEmail] = { contacts: [] };
    }
    if (!data.users[contactEmail].contacts) {
      data.users[contactEmail].contacts = [];
    }
    if (!data.users[contactEmail].contacts.includes(myEmail)) {
      data.users[contactEmail].contacts.push(myEmail);
    }

    saveData();

    // Notify contact if online
    const contactSocket = connectedUsers[contactEmail];
    if (contactSocket) {
      io.to(contactSocket).emit("contact_added", { email: myEmail });
    }

    socket.emit("contact_added_success", { email: contactEmail });
  });

  socket.on("disconnect", () => {
    // Find and remove user from connectedUsers
    for (const [email, socketId] of Object.entries(connectedUsers)) {
      if (socketId === socket.id) {
        delete connectedUsers[email];
        console.log(`${email} disconnected`);
        break;
      }
    }
  });
});

app.get("/", (req, res) => {
  res.send("Liam Chats server running");
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", users: Object.keys(data.users).length });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
