import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const db = new Database("rapid_rescue.db");

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    fingerprint_id TEXT
  );

  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    phone TEXT,
    email TEXT
  );

  CREATE TABLE IF NOT EXISTS incidents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    location_lat REAL,
    location_lng REAL,
    status TEXT,
    details TEXT
  );
`);

// Seed admin if not exists
const seedAdmin = () => {
  const admin = db.prepare("SELECT * FROM admins WHERE username = ?").get("Vigneshwaran v");
  if (!admin) {
    const hashedPassword = bcrypt.hashSync("VICKY2007", 10);
    db.prepare("INSERT INTO admins (username, password) VALUES (?, ?)").run("Vigneshwaran v", hashedPassword);
  } else {
    const hashedPassword = bcrypt.hashSync("VICKY2007", 10);
    db.prepare("UPDATE admins SET password = ? WHERE username = ?").run(hashedPassword, "Vigneshwaran v");
  }
};
seedAdmin();

async function startServer() {
  const app = express();
  const PORT = 3000;
  const JWT_SECRET = process.env.JWT_SECRET || "super-secret-rapid-rescue-key";

  app.use(express.json());

  // API Routes
  app.post("/api/admin/login", (req, res) => {
    const { username, password } = req.body;
    const admin = db.prepare("SELECT * FROM admins WHERE username = ?").get(username);

    if (admin && bcrypt.compareSync(password, admin.password)) {
      const token = jwt.sign({ id: admin.id, username: admin.username }, JWT_SECRET, { expiresIn: "1h" });
      return res.json({ token, hasFingerprint: !!admin.fingerprint_id });
    }
    res.status(401).json({ error: "Invalid credentials" });
  });

  app.post("/api/admin/enroll-fingerprint", (req, res) => {
    const { username, fingerprintId } = req.body;
    db.prepare("UPDATE admins SET fingerprint_id = ? WHERE username = ?").run(fingerprintId, username);
    res.json({ success: true });
  });

  app.post("/api/admin/verify-fingerprint", (req, res) => {
    const { username, fingerprintId } = req.body;
    const admin = db.prepare("SELECT * FROM admins WHERE username = ?").get(username);
    if (admin && admin.fingerprint_id === fingerprintId) {
      const token = jwt.sign({ id: admin.id, username: admin.username }, JWT_SECRET, { expiresIn: "1h" });
      return res.json({ token });
    }
    res.status(401).json({ error: "Wrong fingerprint" });
  });

  app.get("/api/contacts", (req, res) => {
    const contacts = db.prepare("SELECT * FROM contacts").all();
    res.json(contacts);
  });

  app.post("/api/contacts", (req, res) => {
    const { name, phone, email } = req.body;
    db.prepare("INSERT INTO contacts (name, phone, email) VALUES (?, ?, ?)").run(name, phone, email);
    res.json({ success: true });
  });

  // Mock Google Auth
  app.get("/api/auth/google/url", (req, res) => {
    res.json({ url: "/auth/google/login" });
  });

  app.get("/auth/google/login", (req, res) => {
    res.send(`
      <html>
        <head>
          <title>Sign in - Google Accounts</title>
          <style>
            body { font-family: 'Roboto', arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f1f1f1; }
            .card { background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); width: 350px; text-align: center; }
            img { width: 75px; margin-bottom: 20px; }
            h1 { font-size: 24px; margin-bottom: 10px; font-weight: 400; }
            p { color: #5f6368; margin-bottom: 30px; }
            input { width: 100%; padding: 12px; margin-bottom: 15px; border: 1px solid #dadce0; border-radius: 4px; box-sizing: border-box; font-size: 16px; }
            button { background: #1a73e8; color: white; border: none; padding: 10px 24px; border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: 500; float: right; }
            button:hover { background: #1765cc; }
          </style>
        </head>
        <body>
          <div class="card">
            <img src="https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_92x30dp.png" alt="Google">
            <h1>Sign in</h1>
            <p>Use your Google Account</p>
            <form onsubmit="event.preventDefault(); handleLogin()">
              <input type="email" id="email" placeholder="Email or phone" required>
              <input type="password" id="password" placeholder="Enter your password" required>
              <div style="text-align: left; color: #1a73e8; font-size: 14px; margin-bottom: 30px; cursor: pointer;">Forgot password?</div>
              <button type="submit">Next</button>
            </form>
          </div>
          <script>
            function handleLogin() {
              const email = document.getElementById('email').value;
              const password = document.getElementById('password').value;
              
              // Simple mock check
              if (email.includes('@gmail.com') && password.length >= 6) {
                window.opener.postMessage({ type: 'GOOGLE_AUTH_SUCCESS', user: { name: email.split('@')[0] } }, '*');
                window.close();
              } else {
                alert('Invalid email or password. Use a @gmail.com address and password >= 6 chars.');
              }
            }
          </script>
        </body>
      </html>
    `);
  });

  app.delete("/api/contacts/:id", (req, res) => {
    db.prepare("DELETE FROM contacts WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  app.post("/api/incidents", (req, res) => {
    const { lat, lng, details } = req.body;
    db.prepare("INSERT INTO incidents (location_lat, location_lng, details, status) VALUES (?, ?, ?, ?)").run(lat, lng, details, "PENDING");
    res.json({ success: true });
  });

  app.get("/api/incidents", (req, res) => {
    const incidents = db.prepare("SELECT * FROM incidents ORDER BY timestamp DESC").all();
    res.json(incidents);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
