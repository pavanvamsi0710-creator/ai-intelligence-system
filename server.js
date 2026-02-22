import express from "express";
import crypto from "crypto";
import cors from "cors";
import pkg from "pg";

const { Pool } = pkg;

const app = express();
app.use(cors());
app.use(express.json());

/* ================= START SERVER ================= */

async function startServer() {
  try {

    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is missing");
    }

    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });

    await pool.query("SELECT 1");

    /* ================= RESET & CREATE TABLE ================= */

// TEMP FIX – delete old broken table
await pool.query(`
  DROP TABLE IF EXISTS news;
`);

await pool.query(`
  CREATE TABLE news (
    id SERIAL PRIMARY KEY,
    title TEXT,
    source_link TEXT,
    source TEXT,
    photo TEXT,
    video_link TEXT,
    summary TEXT,
    category TEXT,
    topic_hash TEXT UNIQUE,
    repetition_count INT DEFAULT 1,
    score INT DEFAULT 0,
    createdat BIGINT
  )
`);

console.log("✅ Database Reset & Connected");

    /* ================= HELPERS ================= */

    function cleanText(t = "") {
      return t
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim();
    }

    function makeTopicHash(title) {
      return crypto.createHash("sha1").update(title).digest("hex");
    }

    function calculateScore(count, createdat) {
      let score = count * 5;

      const hoursOld = (Date.now() - createdat) / (1000 * 60 * 60);

      if (hoursOld < 1) score += 15;
      else if (hoursOld < 3) score += 8;
      else if (hoursOld < 6) score += 4;

      return score;
    }

    /* ================= SAVE RAW NEWS ================= */

    app.post("/api/news/raw", async (req, res) => {
      try {

        const {
          title,
          source_link,
          source,
          photo,
          video_link,
          summary,
          category
        } = req.body;

        if (!title || !source_link || !source) {
          return res.json({ skipped: true });
        }

        const cleanTitle = cleanText(title);
        const topicHash = makeTopicHash(cleanTitle);

        const existing = await pool.query(
          "SELECT * FROM news WHERE topic_hash=$1",
          [topicHash]
        );

        if (existing.rows.length > 0) {

          const row = existing.rows[0];
          const newCount = row.repetition_count + 1;
          const newScore = calculateScore(newCount, row.createdat);

          await pool.query(
            "UPDATE news SET repetition_count=$1, score=$2 WHERE topic_hash=$3",
            [newCount, newScore, topicHash]
          );

          return res.json({ updated: true });
        }

        const createdat = Date.now();
        const initialScore = calculateScore(1, createdat);

        await pool.query(
          `INSERT INTO news
          (title, source_link, source, photo, video_link, summary, category,
           topic_hash, repetition_count, score, createdat)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            cleanTitle,
            source_link,
            cleanText(source),
            photo || null,
            video_link || null,
            cleanText(summary),
            category || "General",
            topicHash,
            1,
            initialScore,
            createdat
          ]
        );

        res.json({ saved: true });

      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error" });
      }
    });

    /* ================= CATEGORY ROUTE ================= */

    app.get("/api/news/category/:cat", async (req, res) => {
      try {

        const cat = req.params.cat;

        const result = await pool.query(`
          SELECT
            title,
            source_link,
            source,
            photo,
            video_link,
            summary,
            createdat
          FROM news
          WHERE category=$1
          ORDER BY createdat DESC
          LIMIT 30
        `, [cat]);

        res.json(result.rows);

      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error" });
      }
    });

    /* ================= TRENDING (BALANCED) ================= */

    app.get("/api/trending", async (req, res) => {
      try {

        const result = await pool.query(`
          SELECT
            title,
            source_link,
            source,
            photo,
            video_link,
            summary,
            category,
            score,
            createdat
          FROM news
          WHERE createdat > $1
          ORDER BY score DESC
          LIMIT 30
        `, [Date.now() - 24 * 60 * 60 * 1000]);

        res.json(result.rows);

      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error" });
      }
    });

    /* ================= REFRESH ROUTE ================= */

    app.get("/api/latest", async (req, res) => {
      try {

        const result = await pool.query(`
          SELECT
            title,
            source_link,
            source,
            photo,
            video_link,
            summary,
            category,
            createdat
          FROM news
          ORDER BY createdat DESC
          LIMIT 30
        `);

        res.json(result.rows);

      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error" });
      }
    });

    /* ================= START SERVER ================= */

    const PORT = process.env.PORT || 8080;

    app.listen(PORT, "0.0.0.0", () => {
      console.log("🚀 Server running on", PORT);
    });

  } catch (err) {
    console.error("❌ Startup Error:", err);
    process.exit(1);
  }
}

startServer();