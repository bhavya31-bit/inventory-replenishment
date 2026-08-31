import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Package,
  ShoppingCart,
  TrendingDown,
  BarChart3,
  RefreshCw,
  ChevronRight,
  Filter,
  Search,
  AlertCircle,
  Clock,
  Zap,
} from "lucide-react";
import "./index.css";

function RiskBadge({ level }) {
  const icons = {
    HIGH: <AlertTriangle size={14} />,
    MEDIUM: <AlertCircle size={14} />,
    LOW: <TrendingDown size={14} />,
  };
  return (
    <span className={`risk-badge risk-${level?.toLowerCase() || "low"}`}>
      {icons[level]} {level}
    </span>
  );
}

function App() {
  const [view, setView] = useState("dashboard");
  const [materials, setMaterials] = useState([]);
  const [kpis, setKpis] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState("All");
  const [actionLoading, setActionLoading] = useState(false);

  async function api(path, options = {}) {
    const response = await fetch(path, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || data.message || "Request failed");
    return data;
  }

  async function loadData() {
    try {
      setLoading(true);
      const [materialsData, kpiData] = await Promise.all([
        api("/api/materials"),
        api("/api/kpis"),
      ]);
      setMaterials(materialsData);
      setKpis(kpiData);
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  function showToast(message, type = "success") {
    setToast({ message, type });
  }

  async function openMaterial(material) {
    try {
      const fresh = await api(`/api/materials/${material.id}`);
      setSelected(fresh);
      setView("detail");
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  async function createOrder() {
    if (!selected) return;
    const quantity = selected.explanation.recommendedQuantity;

    try {
      setActionLoading(true);
      await api("/api/purchase-orders", {
        method: "POST",
        body: JSON.stringify({ materialId: selected.id, quantity }),
      });
      showToast(`Purchase order created for ${quantity} units`);
      await loadData();
      setSelected(null);
      setView("dashboard");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setActionLoading(false);
    }
  }

  async function receiveStock() {
    if (!selected) return;
    const quantity = prompt("Enter quantity received:");
    if (!quantity || isNaN(quantity) || quantity <= 0) return;

    try {
      setActionLoading(true);
      await api(`/api/materials/${selected.id}/receive-stock`, {
        method: "PATCH",
        body: JSON.stringify({ quantity: parseInt(quantity) }),
      });
      showToast(`Stock received: ${quantity} units`);
      await loadData();
      setSelected(null);
      setView("dashboard");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setActionLoading(false);
    }
  }

  const materialsNeedingOrder = useMemo(
    () => materials.filter((m) => m.needsReplenishment),
    [materials]
  );

  const filteredMaterials = useMemo(() => {
    const query = search.trim().toLowerCase();
    let filtered = materialsNeedingOrder;

    if (riskFilter !== "All") {
      filtered = filtered.filter((m) => m.riskLevel === riskFilter);
    }

    if (query) {
      filtered = filtered.filter((m) =>
        `${m.name} ${m.supplier} ${m.category}`.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [materialsNeedingOrder, search, riskFilter]);

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-content">
          <div className="header-title">
            <Package size={24} />
            <div>
              <h1>Inventory Replenishment</h1>
              <p>Smart material procurement monitoring</p>
            </div>
          </div>
          <button
            className="btn-secondary"
            onClick={() => {
              loadData();
              showToast("Data refreshed");
            }}
          >
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
      </header>

      {/* Navigation */}
      <nav className="nav">
        <button
          className={`nav-btn ${view === "dashboard" ? "active" : ""}`}
          onClick={() => {
            setView("dashboard");
            setSearch("");
            setRiskFilter("All");
          }}
        >
          <BarChart3 size={18} /> Dashboard
        </button>
        <button
          className={`nav-btn ${view === "queue" ? "active" : ""}`}
          onClick={() => {
            setView("queue");
            setSearch("");
            setRiskFilter("All");
          }}
        >
          <ShoppingCart size={18} /> Materials Queue
        </button>
      </nav>

      {/* Main Content */}
      <div className="main">
        {loading && (
          <div className="loading">
            <div className="spinner"></div>
            <p>Loading inventory data...</p>
          </div>
        )}

        {!loading && view === "dashboard" && kpis && (
          <div className="dashboard-view">
            <div className="kpis-grid">
              <div className="kpi-card">
                <div className="kpi-icon critical">
                  <AlertTriangle size={24} />
                </div>
                <div>
                  <div className="kpi-value">{kpis.criticalMaterials}</div>
                  <div className="kpi-label">Critical Materials</div>
                  <div className="kpi-hint">Risk Level: HIGH</div>
                </div>
              </div>

              <div className="kpi-card">
                <div className="kpi-icon warning">
                  <AlertCircle size={24} />
                </div>
                <div>
                  <div className="kpi-value">{kpis.materialsAtRisk}</div>
                  <div className="kpi-label">Materials At Risk</div>
                  <div className="kpi-hint">Below reorder level</div>
                </div>
              </div>

              <div className="kpi-card">
                <div className="kpi-icon">
                  <Clock size={24} />
                </div>
                <div>
                  <div className="kpi-value">{kpis.averageDaysToStockout}</div>
                  <div className="kpi-label">Avg Days to Stockout</div>
                  <div className="kpi-hint">Across all materials</div>
                </div>
              </div>

              <div className="kpi-card">
                <div className="kpi-icon">
                  <Package size={24} />
                </div>
                <div>
                  <div className="kpi-value">{kpis.fillRate}%</div>
                  <div className="kpi-label">Fill Rate</div>
                  <div className="kpi-hint">{kpis.totalMaterials} total materials</div>
                </div>
              </div>

              <div className="kpi-card">
                <div className="kpi-icon">
                  <Zap size={24} />
                </div>
                <div>
                  <div className="kpi-value">{kpis.ordersPlaced}</div>
                  <div className="kpi-label">Orders Pending</div>
                  <div className="kpi-hint">{kpis.ordersDelivered} delivered</div>
                </div>
              </div>

              <div className="kpi-card">
                <div className="kpi-icon">
                  <TrendingDown size={24} />
                </div>
                <div>
                  <div className="kpi-value">
                    ₹{(kpis.totalInventoryValue / 1000).toFixed(0)}K
                  </div>
                  <div className="kpi-label">Inventory Value</div>
                  <div className="kpi-hint">Current stock at cost</div>
                </div>
              </div>
            </div>

            {materialsNeedingOrder.length > 0 && (
              <div className="dashboard-section">
                <h2>Materials Requiring Attention</h2>
                <div className="materials-preview">
                  {materialsNeedingOrder.slice(0, 5).map((material) => (
                    <div
                      key={material.id}
                      className="material-preview-card"
                      onClick={() => openMaterial(material)}
                    >
                      <div className="preview-header">
                        <div className="preview-title">{material.name}</div>
                        <RiskBadge level={material.riskLevel} />
                      </div>
                      <div className="preview-details">
                        <div className="preview-detail">
                          <span className="label">Inventory:</span>
                          <span className="value">{material.currentInventory} units</span>
                        </div>
                        <div className="preview-detail">
                          <span className="label">Days to Stockout:</span>
                          <span className="value">{material.daysToStockout} days</span>
                        </div>
                      </div>
                      <button className="btn-link">
                        View Details <ChevronRight size={16} />
                      </button>
                    </div>
                  ))}
                </div>
                {materialsNeedingOrder.length > 5 && (
                  <button
                    className="btn-primary"
                    onClick={() => setView("queue")}
                  >
                    View All {materialsNeedingOrder.length} Materials
                  </button>
                )}
              </div>
            )}

            {materialsNeedingOrder.length === 0 && (
              <div className="empty-state">
                <CheckCircle2 size={48} />
                <h3>All Systems Normal</h3>
                <p>No materials currently require replenishment.</p>
              </div>
            )}
          </div>
        )}

        {!loading && view === "queue" && (
          <div className="queue-view">
            <div className="queue-header">
              <div className="queue-title">
                <h2>Materials Needing Replenishment</h2>
                <div className="count-badge">{filteredMaterials.length}</div>
              </div>

              <div className="queue-controls">
                <div className="search-box">
                  <Search size={16} />
                  <input
                    type="text"
                    placeholder="Search by name, supplier, or category..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>

                <div className="filter-group">
                  <Filter size={16} />
                  <select
                    value={riskFilter}
                    onChange={(e) => setRiskFilter(e.target.value)}
                  >
                    <option>All Risks</option>
                    <option>HIGH</option>
                    <option>MEDIUM</option>
                    <option>LOW</option>
                  </select>
                </div>
              </div>
            </div>

            {filteredMaterials.length === 0 ? (
              <div className="empty-state">
                <Package size={48} />
                <h3>No materials found</h3>
                <p>Try adjusting your search or filter criteria.</p>
              </div>
            ) : (
              <div className="materials-table">
                <div className="table-header">
                  <div className="col-name">Material</div>
                  <div className="col-inventory">Inventory</div>
                  <div className="col-reorder">Reorder Level</div>
                  <div className="col-risk">Risk</div>
                  <div className="col-days">Days to Stockout</div>
                  <div className="col-action"></div>
                </div>
                {filteredMaterials.map((material) => (
                  <div
                    key={material.id}
                    className="table-row"
                    onClick={() => openMaterial(material)}
                  >
                    <div className="col-name">
                      <div className="material-name">{material.name}</div>
                      <div className="material-sub">
                        {material.supplier} • {material.category}
                      </div>
                    </div>
                    <div className="col-inventory">
                      <span className="qty-badge">{material.currentInventory}</span>
                      <span className="unit">units</span>
                    </div>
                    <div className="col-reorder">{material.reorderLevel}</div>
                    <div className="col-risk">
                      <RiskBadge level={material.riskLevel} />
                    </div>
                    <div className="col-days">
                      <span className={material.daysToStockout < 7 ? "urgent" : ""}>
                        {material.daysToStockout} days
                      </span>
                    </div>
                    <div className="col-action">
                      <ChevronRight size={18} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {!loading && view === "detail" && selected && (
          <div className="detail-view">
            <div className="detail-header">
              <button
                className="btn-back"
                onClick={() => {
                  setView("queue");
                  setSelected(null);
                }}
              >
                ← Back to Queue
              </button>
              <div className="detail-title">
                <h2>{selected.name}</h2>
                <RiskBadge level={selected.riskLevel} />
              </div>
            </div>

            <div className="detail-grid">
              {/* Left Column: Material Info */}
              <div className="detail-section">
                <h3>Material Information</h3>
                <div className="info-block">
                  <div className="info-row">
                    <span className="info-label">Material ID:</span>
                    <span className="info-value">{selected.id}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Category:</span>
                    <span className="info-value">{selected.category}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Supplier:</span>
                    <span className="info-value">{selected.supplier}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Unit Price:</span>
                    <span className="info-value">
                      ₹{selected.unitPrice?.toLocaleString("en-IN")}
                    </span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Importance:</span>
                    <span className="info-value">
                      <span className="importance-stars">
                        {Array(selected.importance)
                          .fill("★")
                          .join("")}
                      </span>
                      {selected.importance}/5
                    </span>
                  </div>
                </div>
              </div>

              {/* Right Column: Inventory Status */}
              <div className="detail-section">
                <h3>Inventory Status</h3>
                <div className="info-block">
                  <div className="info-row">
                    <span className="info-label">Current Inventory:</span>
                    <span className="info-value">{selected.currentInventory} units</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Reorder Level:</span>
                    <span className="info-value">{selected.reorderLevel} units</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Shortage:</span>
                    <span className="info-value alert">
                      {selected.reorderLevel - selected.currentInventory} units
                    </span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Daily Consumption:</span>
                    <span className="info-value">{selected.dailyConsumption} units/day</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Days to Stockout:</span>
                    <span className={`info-value ${selected.daysToStockout < 7 ? "urgent" : ""}`}>
                      {selected.daysToStockout} days
                    </span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Lead Time:</span>
                    <span className="info-value">{selected.leadTimeDays} days</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Risk Explanation Section */}
            <div className="detail-section full-width">
              <h3>Risk Analysis</h3>
              <div className="risk-card">
                <div className="risk-header">
                  <div>
                    <div className="risk-score">
                      Score: {selected.explanation.riskScore.toFixed(1)}/10
                    </div>
                    <div className="risk-summary">
                      {selected.explanation.summary}
                    </div>
                  </div>
                  <div className="risk-rec">
                    <div className="rec-label">Recommended Order:</div>
                    <div className="rec-quantity">
                      {selected.explanation.recommendedQuantity} units
                    </div>
                  </div>
                </div>

                <div className="risk-factors">
                  <div className="factors-title">Factors Contributing to Risk:</div>
                  <ul className="factors-list">
                    {selected.explanation.factors.map((factor, idx) => (
                      <li key={idx}>{factor}</li>
                    ))}
                  </ul>
                </div>

                {selected.explanation.reasons.length > 0 && (
                  <div className="risk-reasons">
                    <div className="reasons-title">Key Reasons:</div>
                    <ul className="reasons-list">
                      {selected.explanation.reasons.map((reason, idx) => (
                        <li key={idx}>{reason}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            {/* Purchase Orders Section */}
            {selected.purchaseOrders?.length > 0 && (
              <div className="detail-section full-width">
                <h3>Active Purchase Orders</h3>
                <div className="pos-list">
                  {selected.purchaseOrders.map((po) => (
                    <div key={po.id} className="po-item">
                      <div className="po-header">
                        <span className="po-id">{po.id}</span>
                        <span className={`po-status po-${po.status}`}>
                          {po.status === "pending" ? "Pending" : "Received"}
                        </span>
                      </div>
                      <div className="po-details">
                        <div>
                          <span className="po-label">Quantity:</span>
                          {po.quantity} units
                        </div>
                        <div>
                          <span className="po-label">Order Date:</span>
                          {new Date(po.orderDate).toLocaleDateString("en-IN")}
                        </div>
                        <div>
                          <span className="po-label">Expected Delivery:</span>
                          {new Date(po.expectedDeliveryDate).toLocaleDateString("en-IN")}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="detail-actions">
              <button
                className="btn-primary"
                onClick={createOrder}
                disabled={actionLoading}
              >
                <ShoppingCart size={16} />
                {actionLoading ? "Creating..." : "Create Purchase Order"}
              </button>
              <button
                className="btn-secondary"
                onClick={receiveStock}
                disabled={actionLoading}
              >
                <Package size={16} />
                {actionLoading ? "Processing..." : "Receive Stock"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          {toast.type === "error" ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
          {toast.message}
        </div>
      )}
    </div>
  );
}

export default App;
