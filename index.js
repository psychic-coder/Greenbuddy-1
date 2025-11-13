const express = require("express");
const bodyParser = require("body-parser");
const { Pool } = require("pg");
const axios = require("axios");
const app = express();
const cors = require("cors");

// OpenRouter API key: prefer environment variable, fallback to existing key for local use
const OPENROUTER_API_KEY =
  "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";

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
  .then(() => console.log("✅ Connected to PostgreSQL."))
  .catch((err) => console.error("❌ Connection error", err));

// ✅ Add fertilizer
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  console.log("Backend");
  const query = `SELECT * FROM users WHERE username = $1 AND password = $2`;

  pool.query(query, [username, password], (err, result) => {
    if (err || result.rows.length === 0) {
      return res.status(401).send("❌ Invalid credentials.");
    }

    const user = result.rows[0];
    res.json({ role: user.role }); // Respond with role as JSON
  });
});

// ✅ Farmer adds product
app.post("/add-product", (req, res) => {
  const { name, type, quantity, unit, price_per_unit, image_url, farmer_id } =
    req.body;

  // Debugging to check values
  console.log("Received product data:", req.body); // Log entire body for debugging
  console.log("Received price_per_unit:", price_per_unit); // Specifically check price_per_unit

  // Check if price_per_unit is undefined or null
  if (price_per_unit == null) {
    return res.status(400).json({
      success: false,
      message: "❌ Price per unit is required!",
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
          message: "❌ Error adding product.",
          error: err.message,
        });
      }

      return res.status(201).json({
        success: true,
        message: "✅ Product added successfully!",
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

// ✅ Get all products (for customers)
app.get("/products", (req, res) => {
  pool.query("SELECT * FROM products", (err, result) => {
    if (err) {
      console.error(err);
      return res.send("❌ Error fetching products.");
    }
    res.json(result.rows);
  });
});

// ✅ Customer places order
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
        message: "❌ Error placing order.",
        error: err.message,
      });
    }

    // If the order was successfully placed
    return res.status(201).json({
      success: true,
      message: "✅ Order placed successfully!",
      order: {
        customer_id,
        product_id,
        quantity,
        order_date: new Date().toISOString(), // Adding current date as order_date
      },
    });
  });
});

// ✅ Farmer views their own products
app.get("/farmer-products/:farmer_id", (req, res) => {
  const farmerId = req.params.farmer_id;
  const query = `SELECT * FROM products WHERE farmer_id = $1`;
  pool.query(query, [farmerId], (err, result) => {
    if (err) {
      console.error(err);
      return res.send("❌ Error fetching farmer products.");
    }
    res.json(result.rows);
  });
});

// ✅ Get all inventory grouped
app.get("/inventory", (req, res) => {
  const query = `SELECT * FROM products`;
  pool.query(query, (err, result) => {
    if (err) {
      console.error(err);
      return res.send("❌ Error fetching inventory.");
    }
    res.json({ products: result.rows });
  });
});

// 🤖 AI crop & farming advisor
app.post("/ai/advice", async (req, res) => {
  const { question, location, crop } = req.body || {};

  if (!question || typeof question !== "string") {
    return res.status(400).json({ error: "Question is required." });
  }

  const apiKey = OPENROUTER_API_KEY;
  if (!apiKey) {
    return res
      .status(500)
      .json({
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
    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "openai/gpt-5.1-chat",
        max_tokens: 3000,
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

// 🤖 AI Farm Insights for farmer dashboard
app.post("/ai/farm-insights", async (req, res) => {
  const { farmer_id } = req.body || {};
  const farmerId = farmer_id;

  if (!farmerId) {
    return res.status(400).json({ error: "farmer_id is required." });
  }

  const apiKey = OPENROUTER_API_KEY;
  if (!apiKey) {
    return res
      .status(500)
      .json({
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

    // Try to parse JSON, handling optional ```json fences
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
      // Fallback: treat raw text as a summary
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
        message: "❌ Error fetching orders.",
        error: err.message,
      });
    }

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "❌ No orders found for this customer.",
      });
    }

    return res.status(200).json({
      success: true,
      orders: result.rows,
    });
  });
});

// ✅ Server
app.listen(3000, () => {
  console.log("🌾 Server running at http://localhost:3000");
});
