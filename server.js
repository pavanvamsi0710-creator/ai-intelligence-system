import express from "express";
import cors from "cors";
import pkg from "pg";

const { Pool } = pkg;

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.get("/", (req, res) => {
  res.send("Backend Running");
});

app.get("/api/news/category/:cat", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM news WHERE category=$1 ORDER BY createdat DESC LIMIT 30`,
      [req.params.cat]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/trending", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM news ORDER BY score DESC LIMIT 30`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log("Server running on", PORT);
});