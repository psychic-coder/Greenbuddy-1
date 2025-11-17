const express = require("express");
const bodyParser = require("body-parser");
const { Pool } = require("pg");
const axios = require("axios");
const FormData = require("form-data");
const app = express();
const cors = require("cors");

const OPENROUTER_API_KEY ="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";

app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static("public"));

const pool = new Pool({
  user: "postgres",
  password: "rohitPen15",
  host: "127.0.0.1",
  port: 5432,
  database: "greenbuddy_db",
});

pool
  .connect()
  .then(() => console.log(" Connected to PostgreSQL."))
  .catch((err) => console.error(" Connection error", err));

app.post("/login", (req, res) => {
  const { username, password } = req.body;
  console.log("Backend");
  const query = `SELECT * FROM users WHERE username = $1 AND password = $2`;

  pool.query(query, [username, password], (err, result) => {
    if (err || result.rows.length === 0) {
      return res.status(401).send("Invalid credentials.");
    }

    const user = result.rows[0];
    res.json({ role: user.role });
  });
});

app.post("/add-product", (req, res) => {
  const { name, type, quantity, unit, price_per_unit, image_url, farmer_id } =
    req.body;

  console.log("Received product data:", req.body);
  console.log("Received price_per_unit:", price_per_unit);

  if (price_per_unit == null) {
    return res.status(400).json({
      success: false,
      message: " Price per unit is required!",
    });
  }

  const query = `
        INSERT INTO products (name, type, quantity, unit, price_per_unit, image_url, farmer_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;

  pool.query(
    query,
    [name, type, quantity, unit, price_per_unit, image_url, farmer_id],
    (err) => {
      if (err) {
        console.error(err);
        return res.status(500).json({
          success: false,
          message: " Error adding product.",
          error: err.message,
        });
      }

      return res.status(201).json({
        success: true,
        message: " Product added successfully!",
        product: {
          name,
          type,
          quantity,
          unit,
          price_per_unit,
          image_url,
          farmer_id,
        },
      });
    }
  );
});

app.get("/products", (req, res) => {
  pool.query("SELECT * FROM products", (err, result) => {
    if (err) {
      console.error(err);
      return res.send(" Error fetching products.");
    }
    res.json(result.rows);
  });
});

// Customer places order
app.post("/place-order", (req, res) => {
  const { customer_id, product_id, quantity } = req.body;
  const query = `
        INSERT INTO orders (customer_id, product_id, quantity, order_date)
        VALUES ($1, $2, $3, NOW())
    `;

  pool.query(query, [customer_id, product_id, quantity], (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).json({
        success: false,
        message: " Error placing order.",
        error: err.message,
      });
    }

    return res.status(201).json({
      success: true,
      message: " Order placed successfully!",
      order: {
        customer_id,
        product_id,
        quantity,
        order_date: new Date().toISOString(),
      },
    });
  });
});

app.get("/farmer-products/:farmer_id", (req, res) => {
  const farmerId = req.params.farmer_id;
  const query = `SELECT * FROM products WHERE farmer_id = $1`;
  pool.query(query, [farmerId], (err, result) => {
    if (err) {
      console.error(err);
      return res.send(" Error fetching farmer products.");
    }
    res.json(result.rows);
  });
});

app.get("/inventory", (req, res) => {
  const query = `SELECT * FROM products`;
  pool.query(query, (err, result) => {
    if (err) {
      console.error(err);
      return res.send("Error fetching inventory.");
    }
    res.json({ products: result.rows });
  });
});

app.post("/ai/advice", async (req, res) => {
  const { question, location, crop } = req.body || {};

  if (!question || typeof question !== "string") {
    return res.status(400).json({ error: "Question is required." });
  }

  const apiKey = OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "AI advisor is not configured. Please set OPENROUTER_API_KEY.",
    });
  }

  const systemPrompt = `You are GreenBuddy, an expert agricultural advisor helping small farmers and consumers.
Always give practical, concise advice about crops, soil, weather, pests, organic practices, and storage.
If asked for something unrelated to farming, politely steer the conversation back to agriculture.`;

  let userContent = `User question: ${question}`;
  if (location) {
    userContent += `\nLocation: ${location}`;
  }
  if (crop) {
    userContent += `\nCrop: ${crop}`;
  }

  try {
    // Load full database context so the AI advisor can reason over users, products, and orders.
    let dbContext = {};
    try {
      const [usersRes, productsRes, ordersRes] = await Promise.all([
        pool.query("SELECT id, username, role FROM users"),
        pool.query(
          "SELECT id, name, type, quantity, unit, price_per_unit, farmer_id FROM products"
        ),
        pool.query(
          "SELECT id, customer_id, product_id, quantity, order_date FROM orders"
        ),
      ]);

      dbContext = {
        users: usersRes.rows,
        products: productsRes.rows,
        orders: ordersRes.rows,
      };
    } catch (dbErr) {
      console.error("Failed to load DB context for AI advice:", dbErr);
    }

    if (Object.keys(dbContext).length > 0) {
      userContent += `\n\nDB_SNAPSHOT (for context; do not expose sensitive details directly):\n${JSON.stringify(
        dbContext
      )}`;
    }

    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "openai/gpt-5.1-chat",
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `${systemPrompt}\n\n${userContent}`,
              },
            ],
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "http://localhost:3000",
          "X-Title": "GreenBuddy AI Advisor",
        },
        timeout: 20000,
      }
    );

    const answer = response.data?.choices?.[0]?.message?.content?.trim();
    return res.json({
      answer: answer || "Sorry, I could not generate advice right now.",
    });
  } catch (err) {
    const openrouterError = err.response?.data || err.message || err;
    console.error("OpenRouter error:", openrouterError);
    return res.status(500).json({
      error: "Failed to get AI advice from OpenRouter.",
      details:
        typeof openrouterError === "string"
          ? openrouterError
          : JSON.stringify(openrouterError),
    });
  }
});

app.post("/ai/farm-insights", async (req, res) => {
  const { farmer_id } = req.body || {};
  const farmerId = farmer_id;

  if (!farmerId) {
    return res.status(400).json({ error: "farmer_id is required." });
  }

  const apiKey = OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "AI advisor is not configured. Please set OPENROUTER_API_KEY.",
    });
  }

  try {
    const query = `
            SELECT name, type, quantity, unit, price_per_unit
            FROM products
            WHERE farmer_id = $1
            ORDER BY id DESC
            LIMIT 50
        `;

    const result = await pool.query(query, [farmerId]);
    const products = result.rows || [];

    const farmState = {
      farmer_id: farmerId,
      total_products: products.length,
      products: products.map((p) => ({
        name: p.name,
        type: p.type,
        quantity: p.quantity,
        unit: p.unit,
        price_per_unit: p.price_per_unit,
      })),
    };

    const systemPrompt = `You are an AI agronomy assistant generating insights for a farmer dashboard.
Given a JSON summary of the farmer's current products and quantities, produce:
- A short, friendly summary (2-3 sentences) of the current situation.
- 3-5 concrete, practical action recommendations.

Respond ONLY as compact JSON with this shape:
{
  "summary": "short text",
  "actions": ["action 1", "action 2", "action 3"]
}`;

    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "openai/gpt-5.1-chat",
        max_tokens: 800,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `${systemPrompt}\n\nFARM_STATE:\n${JSON.stringify(
                  farmState
                )}`,
              },
            ],
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "http://localhost:3000",
          "X-Title": "GreenBuddy Farm Insights",
        },
        timeout: 20000,
      }
    );

    let raw = response.data?.choices?.[0]?.message?.content?.trim() || "";

    let summary = "";
    let actions = [];
    try {
      let jsonText = raw;
      if (jsonText.startsWith("```")) {
        jsonText = jsonText
          .replace(/^```json?/i, "")
          .replace(/```$/, "")
          .trim();
      }
      const parsed = JSON.parse(jsonText);
      summary = parsed.summary || "";
      if (Array.isArray(parsed.actions)) {
        actions = parsed.actions.filter((a) => typeof a === "string");
      }
    } catch (e) {
      summary = raw || "Unable to parse AI insights at the moment.";
      actions = [];
    }

    return res.json({
      summary: summary || "No insights available at the moment.",
      actions,
    });
  } catch (err) {
    const openrouterError = err.response?.data || err.message || err;
    console.error("OpenRouter farm insights error:", openrouterError);
    return res.status(500).json({
      error: "Failed to get AI farm insights from OpenRouter.",
      details:
        typeof openrouterError === "string"
          ? openrouterError
          : JSON.stringify(openrouterError),
    });
  }
});

// Whisper-based transcription for multilingual voice input
// Now also sends the transcribed text plus full DB context to the chat model
// so voice queries can leverage users/products/orders data.
app.post("/ai/transcribe", async (req, res) => {
  const { audioBase64, mimeType, language } = req.body || {};

  if (!audioBase64 || typeof audioBase64 !== "string") {
    return res.status(400).json({ error: "audioBase64 is required." });
  }

  const apiKey = OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "AI advisor is not configured. Please set OPENROUTER_API_KEY.",
    });
  }

  try {
    // Send base64 audio directly to local Flask Whisper backend
    // running at http://localhost:5001/transcribe (see whisper/app.py).
    const whisperResponse = await axios.post(
      "http://localhost:5000/transcribe",
      {
        audioBase64,
        mimeType: mimeType || "audio/webm",
        language,
      },
      {
        timeout: 60000,
      }
    );

    const text = whisperResponse.data?.text || "";

    // In addition to returning the raw transcription, also call the chat model
    // with the transcript plus full DB context so voice queries can use
    // database information.
    let answer = null;
    try {
      let dbContext = {};
      try {
        const [usersRes, productsRes, ordersRes] = await Promise.all([
          pool.query("SELECT id, username, role FROM users"),
          pool.query(
            "SELECT id, name, type, quantity, unit, price_per_unit, farmer_id FROM products"
          ),
          pool.query(
            "SELECT id, customer_id, product_id, quantity, order_date FROM orders"
          ),
        ]);

        dbContext = {
          users: usersRes.rows,
          products: productsRes.rows,
          orders: ordersRes.rows,
        };
      } catch (dbErr) {
        console.error("Failed to load DB context for Whisper chat:", dbErr);
      }

      const systemPrompt = `You are GreenBuddy, an expert agricultural assistant.
You receive a voice transcription from the user and a snapshot of the
current database state (users, products, orders). Use the DB context to
answer accurately about products, availability, and orders, but do not
leak raw sensitive data like passwords.`;

      let userContent = `Transcribed voice input: ${text}`;
      if (Object.keys(dbContext).length > 0) {
        userContent += `\n\nDB_SNAPSHOT (for context; do not expose sensitive details directly):\n${JSON.stringify(
          dbContext
        )}`;
      }

      const chatResponse = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          model: "openai/gpt-5.1-chat",
          max_tokens: 1500,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `${systemPrompt}\n\n${userContent}`,
                },
              ],
            },
          ],
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:3000",
            "X-Title": "GreenBuddy Whisper + Chat",
          },
          timeout: 20000,
        }
      );

      answer = chatResponse.data?.choices?.[0]?.message?.content?.trim() || null;
    } catch (chatErr) {
      const openrouterError = chatErr.response?.data || chatErr.message || chatErr;
      console.error("OpenRouter Whisper-followup chat error:", openrouterError);
    }

    return res.json({ text, answer });
  } catch (err) {
    const openrouterError = err.response?.data || err.message || err;
    console.error("OpenRouter Whisper error:", openrouterError);
    return res.status(500).json({
      error: "Failed to transcribe audio with Whisper.",
      details:
        typeof openrouterError === "string"
          ? openrouterError
          : JSON.stringify(openrouterError),
    });
  }
});

app.post("/get-customer-orders", (req, res) => {
  const { customer_id } = req.body;

  const query = `
        SELECT * 
        FROM orders 
        WHERE customer_id = $1;
    `;

  pool.query(query, [customer_id], (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).json({
        success: false,
        message: " Error fetching orders.",
        error: err.message,
      });
    }

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: " No orders found for this customer.",
      });
    }

    return res.status(200).json({
      success: true,
      orders: result.rows,
    });
  });
});

//  Server
app.listen(3000, () => {
  console.log("🌾 Server running at http://localhost:3000");
});
