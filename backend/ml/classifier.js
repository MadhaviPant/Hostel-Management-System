// ml/classifier.js
// ─────────────────────────────────────────────────────────────────────────────
//  ML Classification Module
//  Implements keyword-based Naive Bayes-style classification for:
//    1. Complaint Category  → Electrical | Plumbing | WiFi | Housekeeping | Other
//    2. Complaint Priority  → Low | Medium | High
//
//  Algorithm explanation (for viva):
//  - Each category has a weighted keyword dictionary
//  - Input text is tokenized (lowercased, split by spaces/punctuation)
//  - Each token is scored against keyword weights
//  - Category with highest cumulative score wins
//  - This simulates a simplified Naive Bayes text classifier where
//    P(category | text) ∝ Σ weight(keyword) for matching keywords
// ─────────────────────────────────────────────────────────────────────────────

// Keyword dictionaries with weights (higher = stronger signal)
const CATEGORY_KEYWORDS = {
  Electrical: {
    fan: 3, light: 3, bulb: 3, electricity: 3, electric: 3, switch: 3,
    socket: 3, wiring: 3, power: 2, voltage: 2, fuse: 3, mcb: 3,
    tripping: 2, spark: 3, short: 2, circuit: 2, inverter: 2,
    geyser: 2, heater: 2, charger: 1, plug: 2, fitting: 2, tube: 2
  },
  Plumbing: {
    water: 3, tap: 3, pipe: 3, leak: 3, leakage: 3, drain: 3,
    flush: 3, toilet: 3, bathroom: 2, shower: 3, overflow: 2,
    blockage: 3, blocked: 3, dripping: 3, clog: 3, basin: 2,
    sewage: 3, tank: 2, supply: 1, plumber: 3, wet: 1
  },
  WiFi: {
    wifi: 3, internet: 3, network: 3, connection: 2, slow: 2,
    speed: 2, router: 3, signal: 2, disconnected: 3, online: 2,
    lag: 2, bandwidth: 2, browsing: 2, connectivity: 2, hotspot: 2,
    'wi-fi': 3, broadband: 2, modem: 3
  },
  Housekeeping: {
    clean: 3, cleaning: 3, dirty: 3, garbage: 3, dustbin: 3,
    dust: 3, sweep: 3, mop: 2, room: 1, corridor: 2, bathroom: 1,
    toilet: 1, mess: 2, hygiene: 3, housekeeping: 3, waste: 2,
    stink: 3, smell: 2, pest: 3, cockroach: 3, rat: 3, ants: 2,
    insect: 2, overflowing: 2, spill: 2, stain: 2
  }
};

// Priority rules — checked in order High → Medium → Low
const PRIORITY_RULES = {
  High: [
    'spark', 'electric spark', 'fire', 'short circuit', 'no electricity',
    'complete failure', 'not working', 'broken', 'sewage', 'overflow',
    'flood', 'pest', 'cockroach', 'rat', 'dangerous', 'urgent',
    'emergency', 'safety', 'injury', 'hazard', 'gas', 'leakage',
    'blocked toilet', 'no water', 'no light', 'no fan'
  ],
  Medium: [
    'slow', 'intermittent', 'sometimes', 'occasionally', 'issue',
    'problem', 'not proper', 'partially', 'flickering', 'dripping',
    'dirty', 'smell', 'stink', 'lag', 'disconnected'
  ],
  Low: [
    'minor', 'small', 'little', 'slight', 'request', 'suggestion',
    'feedback', 'clean', 'dust', 'noise', 'inconvenience'
  ]
};

/**
 * Tokenize input text into lowercase words/ngrams
 */
function tokenize(text) {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1);
}

/**
 * classifyComplaint(description)
 * ─────────────────────────────
 * Input : complaint description string
 * Output: { category: string, priority: string, scores: object, confidence: number }
 *
 * Process:
 *  1. Tokenize the input
 *  2. Score each category by summing keyword weights
 *  3. Pick highest-scoring category (default: 'Other')
 *  4. Determine priority by checking priority rule keywords
 *  5. Return results with confidence score (for UI display)
 */
function classifyComplaint(description) {
  if (!description || description.trim().length === 0) {
    return { category: 'Other', priority: 'Medium', scores: {}, confidence: 0 };
  }

  const text   = description.toLowerCase();
  const tokens = tokenize(description);
  const scores = {};

  // Score each category
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    scores[cat] = 0;
    for (const [keyword, weight] of Object.entries(keywords)) {
      // Check both token match and substring match for multi-word keywords
      if (tokens.includes(keyword) || text.includes(keyword)) {
        scores[cat] += weight;
      }
    }
  }

  // Find best category
  let bestCategory = 'Other';
  let bestScore    = 0;
  let totalScore   = Object.values(scores).reduce((a, b) => a + b, 0);

  for (const [cat, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore    = score;
      bestCategory = cat;
    }
  }

  // Confidence: ratio of best score to total (0–100%)
  const confidence = totalScore > 0
    ? Math.round((bestScore / totalScore) * 100)
    : 0;

  // Determine priority
  let priority = 'Medium'; // default
  outer:
  for (const [level, keywords] of Object.entries(PRIORITY_RULES)) {
    for (const kw of keywords) {
      if (text.includes(kw)) {
        priority = level;
        break outer;
      }
    }
  }

  // Predict resolution time (hours) based on category + priority
  const timeMatrix = {
    Electrical:   { High: 4,  Medium: 8,  Low: 24 },
    Plumbing:     { High: 4,  Medium: 8,  Low: 24 },
    WiFi:         { High: 6,  Medium: 12, Low: 48 },
    Housekeeping: { High: 2,  Medium: 4,  Low: 12 },
    Other:        { High: 8,  Medium: 12, Low: 48 }
  };

  const predicted_time = timeMatrix[bestCategory]?.[priority] ?? 12;

  return {
    category:       bestCategory,
    priority,
    predicted_time,
    confidence,
    scores          // returned for transparency/debugging
  };
}

module.exports = { classifyComplaint };
