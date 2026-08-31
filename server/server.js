import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = Number(process.env.PORT) || 5000;

app.use(cors());
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataFile = path.join(__dirname, "data", "store.json");

// ============================================================
// DATA PERSISTENCE
// ============================================================

function readStore() {
  try {
    return JSON.parse(fs.readFileSync(dataFile, "utf8"));
  } catch {
    return { materials: [], purchaseOrders: [], consumptionHistory: [] };
  }
}

function writeStore(store) {
  fs.writeFileSync(dataFile, JSON.stringify(store, null, 2), "utf8");
}

// ============================================================
// BUSINESS LOGIC: RISK SCORING
// ============================================================

/**
 * Calculate risk score for a material based on multiple factors
 * Returns a score 1-10 (10 = highest risk)
 */
function calculateRiskScore(material) {
  const shortage = material.reorderLevel - material.currentInventory;
  const shortageGap = Math.max(0, shortage);
  const daysToStockout = material.dailyConsumption > 0
    ? material.currentInventory / material.dailyConsumption
    : 999;

  let score = 0;

  // Factor 1: Shortage gap (how far below reorder level) - weight 30%
  const shortageRatio = shortageGap / material.reorderLevel;
  score += Math.min(3, shortageRatio * 3);

  // Factor 2: Days until stockout - weight 30%
  // If < 7 days to stockout, high risk
  if (daysToStockout < 7) {
    score += 3 * (1 - daysToStockout / 7);
  }

  // Factor 3: Lead time vs days to stockout - weight 25%
  // If lead time > days to stockout, critical risk
  if (material.leadTimeDays > daysToStockout) {
    score += 2.5;
  } else if (material.leadTimeDays > daysToStockout * 0.5) {
    score += 1.5;
  }

  // Factor 4: Material importance - weight 15%
  // Importance scale 1-5, convert to 0-1.5
  score += (material.importance / 5) * 1.5;

  return Math.min(10, Math.round(score * 10) / 10);
}

/**
 * Determine risk level based on score
 */
function getRiskLevel(score) {
  if (score >= 7) return "HIGH";
  if (score >= 4) return "MEDIUM";
  return "LOW";
}

/**
 * Determine if material needs replenishment
 */
function needsReplenishment(material) {
  return material.currentInventory < material.reorderLevel;
}

/**
 * Calculate recommended order quantity
 * Should cover: shortage + safety stock during lead time
 */
function calculateRecommendedQuantity(material) {
  const shortage = Math.max(0, material.reorderLevel - material.currentInventory);
  const safetyStock = material.leadTimeDays * material.dailyConsumption;
  return Math.round(shortage + safetyStock);
}

/**
 * Generate detailed risk explanation
 */
function generateRiskExplanation(material) {
  const shortage = material.reorderLevel - material.currentInventory;
  const daysToStockout = material.dailyConsumption > 0
    ? Math.round(material.currentInventory / material.dailyConsumption)
    : 999;
  const score = calculateRiskScore(material);
  const riskLevel = getRiskLevel(score);

  const factors = [];
  
  factors.push(
    `Current inventory is ${material.currentInventory} units, ` +
    `${Math.abs(shortage)} units below the reorder level of ${material.reorderLevel}.`
  );

  if (daysToStockout < 999) {
    factors.push(
      `At current consumption rate of ${material.dailyConsumption} units/day, ` +
      `inventory will be exhausted in approximately ${daysToStockout} days.`
    );
  }

  factors.push(
    `Supplier lead time is ${material.leadTimeDays} days. ` +
    (material.leadTimeDays > daysToStockout
      ? `This EXCEEDS the time to stockout, creating critical supply risk.`
      : `This is manageable relative to the time to stockout.`)
  );

  factors.push(
    `Material importance level is ${material.importance}/5. ` +
    (material.importance >= 4
      ? `This is a critical component.`
      : material.importance >= 3
        ? `This is an important component.`
        : `This is a standard component.`)
  );

  const reasons = [];
  if (shortage > material.reorderLevel * 0.5) {
    reasons.push("Significant shortage relative to reorder level");
  }
  if (daysToStockout < 7) {
    reasons.push("Imminent risk of stockout");
  }
  if (material.leadTimeDays > daysToStockout) {
    reasons.push("Lead time exceeds time to stockout");
  }
  if (material.importance >= 4) {
    reasons.push("Critical material");
  }

  return {
    summary:
      riskLevel === "HIGH"
        ? "Urgent replenishment required to avoid stockout."
        : riskLevel === "MEDIUM"
          ? "Review replenishment needs soon."
          : "Monitor but no immediate action required.",
    factors,
    reasons,
    riskScore: score,
    riskLevel,
    recommendedQuantity: calculateRecommendedQuantity(material),
  };
}

/**
 * Enrich material with calculated fields
 */
function enrichMaterial(material) {
  const needsOrder = needsReplenishment(material);
  const riskScore = calculateRiskScore(material);
  const riskLevel = getRiskLevel(riskScore);
  const explanation = generateRiskExplanation(material);

  return {
    ...material,
    needsReplenishment: needsOrder,
    riskScore,
    riskLevel,
    daysToStockout:
      material.dailyConsumption > 0
        ? Math.round(material.currentInventory / material.dailyConsumption)
        : 999,
    explanation,
  };
}


function variance(order) {
  return ((order.received - order.ordered) / order.ordered) * 100;
}


// ============================================================
// API ENDPOINTS
// ============================================================

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", mode: "inventory-replenishment" });
});

/**
 * GET /api/materials
 * Returns all materials with risk calculations
 */
app.get("/api/materials", (req, res) => {
  const store = readStore();
  const enriched = store.materials.map(enrichMaterial);
  res.json(enriched);
});

/**
 * GET /api/materials/:id
 * Returns a single material with full details
 */
app.get("/api/materials/:id", (req, res) => {
  const store = readStore();
  const material = store.materials.find((m) => m.id === req.params.id);
  if (!material) {
    return res.status(404).json({ error: "Material not found" });
  }

  const enriched = enrichMaterial(material);
  const pos = store.purchaseOrders.filter((po) => po.materialId === material.id);

  res.json({
    ...enriched,
    purchaseOrders: pos,
  });
});

/**
 * GET /api/materials-needing-order
 * Returns only materials that need replenishment, sorted by risk
 */
app.get("/api/materials-needing-order", (req, res) => {
  const store = readStore();
  const enriched = store.materials
    .map(enrichMaterial)
    .filter((m) => m.needsReplenishment)
    .sort((a, b) => {
      // Sort by risk level (HIGH > MEDIUM > LOW) then by score (descending)
      const riskOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 };
      const riskDiff = riskOrder[b.riskLevel] - riskOrder[a.riskLevel];
      if (riskDiff !== 0) return riskDiff;
      return b.riskScore - a.riskScore;
    });

  res.json(enriched);
});

/**
 * GET /api/kpis
 * Returns dashboard KPIs
 */
app.get("/api/kpis", (req, res) => {
  const store = readStore();
  const enriched = store.materials.map(enrichMaterial);

  const critical = enriched.filter((m) => m.riskLevel === "HIGH");
  const atRisk = enriched.filter((m) => m.needsReplenishment);
  const ordered = store.purchaseOrders.filter((po) => po.status === "pending");
  const delivered = store.purchaseOrders.filter((po) => po.status === "received");
  const averageDaysToStockout =
    enriched.length > 0
      ? Math.round(enriched.reduce((sum, m) => sum + m.daysToStockout, 0) / enriched.length)
      : 0;

  const fillRate =
    store.materials.length > 0
      ? Math.round(
          ((store.materials.length - atRisk.length) / store.materials.length) * 100
        )
      : 100;

  const totalInventoryValue = store.materials.reduce(
    (sum, m) => sum + m.currentInventory * m.unitPrice,
    0
  );

  res.json({
    totalMaterials: store.materials.length,
    materialsAtRisk: atRisk.length,
    criticalMaterials: critical.length,
    ordersPlaced: ordered.length,
    ordersDelivered: delivered.length,
    averageDaysToStockout,
    fillRate,
    totalInventoryValue: Math.round(totalInventoryValue),
  });
});

/**
 * GET /api/risk-analysis/:id
 * Returns detailed risk analysis for a material
 */
app.get("/api/risk-analysis/:id", (req, res) => {
  const store = readStore();
  const material = store.materials.find((m) => m.id === req.params.id);
  if (!material) {
    return res.status(404).json({ error: "Material not found" });
  }

  const explanation = generateRiskExplanation(material);
  res.json({
    materialId: material.id,
    materialName: material.name,
    ...explanation,
  });
});

/**
 * POST /api/purchase-orders
 * Create a new purchase order
 */
app.post("/api/purchase-orders", (req, res) => {
  const { materialId, quantity } = req.body;

  if (!materialId || !quantity || quantity <= 0) {
    return res.status(400).json({ error: "Invalid material ID or quantity" });
  }

  const store = readStore();
  const material = store.materials.find((m) => m.id === materialId);
  if (!material) {
    return res.status(404).json({ error: "Material not found" });
  }

  const today = new Date().toISOString().split("T")[0];
  const expectedDelivery = new Date();
  expectedDelivery.setDate(expectedDelivery.getDate() + material.leadTimeDays);
  const expectedDeliveryDate = expectedDelivery.toISOString().split("T")[0];

  const po = {
    id: `PO-${Date.now()}`,
    materialId,
    materialName: material.name,
    quantity,
    orderDate: today,
    expectedDeliveryDate,
    actualDeliveryDate: null,
    status: "pending",
    supplier: material.supplier,
    totalCost: quantity * material.unitPrice,
    notes: "Created via replenishment system",
  };

  store.purchaseOrders.push(po);
  writeStore(store);

  res.json({ success: true, purchaseOrder: po });
});

/**
 * PATCH /api/materials/:id/receive-stock
 * Mark a material as having received stock (simulate delivery)
 */
app.patch("/api/materials/:id/receive-stock", (req, res) => {
  const { quantity } = req.body;

  if (!quantity || quantity <= 0) {
    return res.status(400).json({ error: "Invalid quantity" });
  }

  const store = readStore();
  const material = store.materials.find((m) => m.id === req.params.id);
  if (!material) {
    return res.status(404).json({ error: "Material not found" });
  }

  material.currentInventory += quantity;
  material.status = "normal";
  material.lastOrderDate = new Date().toISOString().split("T")[0];

  // Mark related POs as received
  store.purchaseOrders.forEach((po) => {
    if (po.materialId === req.params.id && po.status === "pending") {
      if (po.quantity === quantity) {
        po.status = "received";
        po.actualDeliveryDate = new Date().toISOString().split("T")[0];
      }
    }
  });

  writeStore(store);

  res.json({
    success: true,
    material: enrichMaterial(material),
  });
});

/**
 * GET /api/purchase-orders
 * List all purchase orders
 */
app.get("/api/purchase-orders", (req, res) => {
  const store = readStore();
  res.json(store.purchaseOrders);
});

/**
 * GET /api/purchase-orders/:id
 * Get a specific purchase order
 */
app.get("/api/purchase-orders/:id", (req, res) => {
  const store = readStore();
  const po = store.purchaseOrders.find((p) => p.id === req.params.id);
  if (!po) {
    return res.status(404).json({ error: "Purchase order not found" });
  }
  res.json(po);
});

// ============================================================
// SERVE FRONTEND IN PRODUCTION
// ============================================================

const distPath = path.join(__dirname, "..", "dist");
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Inventory Replenishment Server running on port ${PORT} on 0.0.0.0`);
});
