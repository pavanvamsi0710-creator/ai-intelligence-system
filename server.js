import express from "express";
import cors from "cors";
import axios from "axios";
import Parser from "rss-parser";
import * as cheerio from "cheerio";
import cron from "node-cron";
import { v4 as uuidv4 } from "uuid";

const app = express();
app.use(cors());
app.use(express.json());

const parser = new Parser();

let newsDB = [];
let deletedNews = [];

const PORT = 5000;
app.get("/", (req, res) => {
  res.send("Backend Working");
});
/* -----------------------------------------
   NEWS SOURCES (Sports example)
------------------------------------------ */

const sources = {
  cricket: [
    "https://news.google.com/rss/search?q=cricket&hl=en-IN&gl=IN&ceid=IN:en"
  ],
  football: [
    "https://news.google.com/rss/search?q=football&hl=en-IN&gl=IN&ceid=IN:en"
  ],
  india: [
    "https://news.google.com/rss/search?q=india+news&hl=en-IN&gl=IN&ceid=IN:en"
  ]
};

/* -----------------------------------------
   CLEAN HTML FUNCTION
------------------------------------------ */

function cleanHTML(html) {
  const $ = cheerio.load(html || "");
  return $.text().replace(/\s+/g, " ").trim();
}

/* -----------------------------------------
   FETCH NEWS
------------------------------------------ */

async function fetchNews() {
  for (let category in sources) {
    for (let url of sources[category]) {
      const feed = await parser.parseURL(url);

      feed.items.forEach(item => {
        const cleanedSummary = cleanHTML(item.contentSnippet);

        const newsItem = {
          id: uuidv4(),
          title: item.title,
          source_link: item.link,
          source: item.creator || feed.title || "Unknown",
          photo: null,
          video_link: null,
          summary: cleanedSummary,
          category,
          published_at: item.pubDate,
          incident_date: item.pubDate,
          created_at: new Date(),
          deleted: false
        };

        // avoid duplicates
        if (!newsDB.some(n => n.title === newsItem.title)) {
          newsDB.push(newsItem);
        }
      });
    }
  }

  console.log("News updated:", new Date());
}

/* -----------------------------------------
   AUTO FETCH EVERY 2 MINUTES
------------------------------------------ */

cron.schedule("*/2 * * * *", () => {
  fetchNews();
});

/* -----------------------------------------
   AUTO DELETE AFTER 38 HOURS
------------------------------------------ */

cron.schedule("0 * * * *", () => {
  const now = new Date();

  newsDB.forEach(news => {
    const hours = (now - new Date(news.created_at)) / (1000 * 60 * 60);

    if (hours >= 38 && !news.deleted) {
      news.deleted = true;
      deletedNews.push(news);
    }
  });

  newsDB = newsDB.filter(news => !news.deleted);

  console.log("Auto deletion checked");
});

/* -----------------------------------------
   GET NEWS BY CATEGORY
------------------------------------------ */

app.get("/news/:category", (req, res) => {
  const category = req.params.category;
  const data = newsDB
    .filter(n => n.category === category)
    .sort((a, b) => new Date(b.published_at) - new Date(a.published_at));

  res.json(data);
});

/* -----------------------------------------
   REFRESH ROUTE
------------------------------------------ */

app.get("/refresh", async (req, res) => {
  await fetchNews();
  res.json({ message: "News refreshed successfully" });
});

/* -----------------------------------------
   ADMIN ROUTES
------------------------------------------ */

app.get("/admin/active", (req, res) => {
  res.json(newsDB);
});

app.get("/admin/deleted", (req, res) => {
  res.json(deletedNews);
});

app.post("/admin/restore/:id", (req, res) => {
  const id = req.params.id;
  const news = deletedNews.find(n => n.id === id);

  if (news) {
    news.deleted = false;
    newsDB.push(news);
    deletedNews = deletedNews.filter(n => n.id !== id);
    res.json({ message: "Restored successfully" });
  } else {
    res.json({ message: "Not found" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  fetchNews();
});