require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { SquareClient, SquareEnvironment } = require('square');

const isProd = process.env.SQUARE_ENV === 'production';
const square = new SquareClient({
  token: process.env.SQUARE_ACCESS_TOKEN,
  environment: isProd ? SquareEnvironment.Production : SquareEnvironment.Sandbox,
});

// Prices live on the server so the browser can never change what it pays.
const COURSES = {
  lite: { cents: 5000, file: 'lite-marketing-course.txt' },
  indepth: { cents: 150000, file: 'in-depth-marketing-course.txt' },
};

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/config', (req, res) =>
  res.json({ appId: process.env.SQUARE_APP_ID, locationId: process.env.SQUARE_LOCATION_ID, isProd })
);

app.post('/api/pay', async (req, res) => {
  const { sourceId, course } = req.body || {};
  const item = COURSES[course];
  if (!sourceId || !item) return res.status(400).json({ error: 'Invalid request.' });

  try {
    const { payment } = await square.payments.create({
      sourceId,
      idempotencyKey: crypto.randomUUID(),
      locationId: process.env.SQUARE_LOCATION_ID,
      amountMoney: { amount: BigInt(item.cents), currency: 'USD' },
      note: `Course: ${course}`,
    });
    if (payment.status !== 'COMPLETED') return res.status(402).json({ error: 'Payment was not completed.' });

    // Course text is only sent after Square confirms the charge.
    const text = fs.readFileSync(path.join(__dirname, 'courses', item.file), 'utf8');
    res.json({ filename: item.file, content: text });
  } catch (err) {
    const detail = err?.errors?.[0]?.detail || 'Your card was declined. Check the details and try again.';
    res.status(402).json({ error: detail });
  }
});

app.listen(process.env.PORT || 3000, () => console.log('Running on http://localhost:' + (process.env.PORT || 3000)));
