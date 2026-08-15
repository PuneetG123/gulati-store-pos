/**
 * Gulati Store POS - Core JavaScript Application Logic
 * State Management, POS Cart Actions, Indian GST Engine, CSV Parser, SVG Charting
 */

// Global State
let state = {
  products: [],
  cart: [],
  transactions: [],
  customers: [],
  ledgerEntries: [],
  settings: {},
  activePage: 'dashboard',
  activeStatementPhone: ''
};

// Initialize Application
document.addEventListener("DOMContentLoaded", async () => {
  await initData();
  setupSidebarToggle();
  setupNavigation();
  setupPOSCartActions();
  setupScannerSimulator();
  setupInventoryActions();
  setupTransactionsLedger();
  setupCSVImportExport();
  setupCustomerLedgerActions();
  setupStoreSettings(); // Initialize store and printer settings listeners
  
  // Initial renders
  renderAll();

  // Real-Time Multi-Device Sync: Re-fetch latest server data whenever window gains focus
  window.addEventListener("focus", async () => {
    await syncFromServer();
  });

  // Non-destructive background polling every 5 seconds
  setInterval(async () => {
    if (document.visibilityState === "visible") {
      await syncFromServer();
    }
  }, 5000);

  // Scroll to Top Button Visibility Listener
  const mainContent = document.getElementById("main-content");
  const scrollTopBtn = document.getElementById("scroll-to-top-btn");
  if (mainContent && scrollTopBtn) {
    mainContent.addEventListener("scroll", () => {
      if (mainContent.scrollTop > 80) {
        scrollTopBtn.style.opacity = "1";
        scrollTopBtn.style.pointerEvents = "auto";
      } else {
        scrollTopBtn.style.opacity = "0";
        scrollTopBtn.style.pointerEvents = "none";
      }
    });
  }

  // Register Service Worker for PWA (Mobile App Installation)
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('./service-worker.js');
      console.log('Service Worker registered successfully.');
    } catch (err) {
      console.warn('Service Worker registration failed:', err);
    }
  }
});

// Non-destructive background polling sync
async function syncFromServer() {
  try {
    const response = await fetch('/api/data', {
      headers: getAuthHeaders()
    });
    if (response.ok) {
      const serverData = await response.json();
      if (serverData && Array.isArray(serverData.products) && (serverData.products.length > 0 || serverData.customers.length > 0)) {
        state.products = serverData.products;
        state.transactions = serverData.transactions || [];
        state.customers = serverData.customers || [];
        state.ledgerEntries = serverData.ledgerEntries || [];
        
        try {
          localStorage.setItem("fc_products", JSON.stringify(state.products));
          localStorage.setItem("fc_transactions", JSON.stringify(state.transactions));
          localStorage.setItem("fc_customers", JSON.stringify(state.customers));
        } catch(e) {}

        renderAll();
      }
    }
  } catch(err) {
    console.warn("Background sync skipped due to network glitch:", err);
  }
}

// ----------------------------------------------------
// DATA PERSISTENCE & INITIALIZATION
// ----------------------------------------------------
async function initData() {
  let loadedState = null;

  // 1. Try to load from SQLite server with auth token
  try {
    const response = await fetch('/api/data', {
      headers: getAuthHeaders()
    });
    
    if (response.status === 401) {
      showLoginScreen();
    } else if (response.ok) {
      const serverData = await response.json();
      if (serverData && Array.isArray(serverData.products)) {
        loadedState = serverData;
        console.log("Loaded data from server database successfully.");
      }
    }
  } catch (err) {
    console.warn("Could not connect to database server, checking local storage:", err);
  }

  // 2. If server database is unreachable, check local storage
  if (!loadedState) {
    const localProducts = localStorage.getItem("fc_products");
    if (localProducts) {
      try {
        const prods = JSON.parse(localProducts);
        if (Array.isArray(prods) && prods.length > 0) {
          loadedState = {
            products: prods,
            transactions: JSON.parse(localStorage.getItem("fc_transactions") || "[]"),
            customers: JSON.parse(localStorage.getItem("fc_customers") || "[]"),
            ledgerEntries: JSON.parse(localStorage.getItem("fc_ledger") || "[]")
          };
          console.log("Loaded data from localStorage.");
        }
      } catch (e) {
        console.error("Error parsing localStorage data:", e);
      }
    }
  }

  // 3. If both are empty, load default seeded data
  if (!loadedState) {
    loadedState = {
      products: [...INITIAL_PRODUCTS],
      transactions: [...INITIAL_TRANSACTIONS],
      customers: [
        { name: "Rahul Sharma", phone: "9876543210", totalPurchased: 396.00, balance: 0.00, lastTxn: getDateDaysAgo(6) },
        { name: "Priya Patel", phone: "9911223344", totalPurchased: 706.20, balance: 706.20, lastTxn: getDateDaysAgo(5) },
        { name: "Aman Verma", phone: "9812345678", totalPurchased: 519.70, balance: 0.00, lastTxn: getDateDaysAgo(4) },
        { name: "Sanjay Gupta", phone: "9009009001", totalPurchased: 943.36, balance: 400.00, lastTxn: getDateDaysAgo(3) }
      ],
      ledgerEntries: [
        { date: getDateDaysAgo(5) + "T14:30:22Z", phone: "9911223344", type: "debit", amount: 706.20, ref: "TXN-902149" },
        { date: getDateDaysAgo(3) + "T11:20:00Z", phone: "9009009001", type: "debit", amount: 943.36, ref: "TXN-902151" },
        { date: getDateDaysAgo(2) + "T12:00:00Z", phone: "9009009001", type: "credit", amount: 543.36, ref: "Cash" }
      ]
    };
    console.log("Loaded default seeded data.");
    syncToServer(loadedState);
  }

  // Bind to application state
  state.products = loadedState.products || [];
  state.transactions = loadedState.transactions || [];
  state.customers = loadedState.customers || [];
  state.ledgerEntries = loadedState.ledgerEntries || [];

  // Backup loaded state to local storage as browser cache backup (safe try-catch)
  try {
    localStorage.setItem("fc_products", JSON.stringify(state.products));
    localStorage.setItem("fc_transactions", JSON.stringify(state.transactions));
    localStorage.setItem("fc_customers", JSON.stringify(state.customers));
    
    // Strip heavy base64 attachmentData from localStorage backup to stay under 5MB browser quota
    const lightLedger = state.ledgerEntries.map(entry => {
      if (entry.attachmentData) {
        const { attachmentData, ...rest } = entry;
        return rest;
      }
      return entry;
    });
    localStorage.setItem("fc_ledger", JSON.stringify(lightLedger));
  } catch (e) {
    console.warn("localStorage cache backup skipped due to quota limit:", e);
  }

  // Bind settings
  state.settings = {};
  if (loadedState.settings && Array.isArray(loadedState.settings)) {
    loadedState.settings.forEach(s => {
      state.settings[s.key] = s.value;
    });
  }
  // Ensure default fallbacks are defined
  if (!state.settings.printer_name) state.settings.printer_name = localStorage.getItem('fc_printer_name') || 'Default';
  if (!state.settings.auto_print) state.settings.auto_print = localStorage.getItem('fc_auto_print') || 'false';
  if (!state.settings.gstin) state.settings.gstin = localStorage.getItem('fc_gstin') || '07AAAAA1111A1Z1';
}

async function syncToServer(overrideState = null) {
  if (window.location.protocol === 'file:') {
    return; // Skip syncing if page is loaded locally directly from file://
  }
  try {
    const payload = overrideState || {
      products: state.products,
      transactions: state.transactions,
      customers: state.customers,
      ledgerEntries: state.ledgerEntries
    };
    const response = await fetch('/api/save', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify(payload)
    });
    
    if (response.status === 401) {
      showLoginScreen();
      return;
    }

    if (!response.ok) {
      console.error("Failed to sync database state to SQLite server:", response.statusText);
    }
  } catch (err) {
    console.error("Network error, failed to sync state to SQLite server:", err);
  }
}

function saveCustomersToStorage() {
  try {
    localStorage.setItem("fc_customers", JSON.stringify(state.customers));
  } catch (e) {
    console.warn("localStorage save failed for customers:", e);
  }
  syncToServer();
}

function saveLedgerToStorage() {
  try {
    // Strip heavy base64 attachmentData from localStorage backup to stay under 5MB browser quota
    const lightLedger = state.ledgerEntries.map(entry => {
      if (entry.attachmentData) {
        const { attachmentData, ...rest } = entry;
        return rest;
      }
      return entry;
    });
    localStorage.setItem("fc_ledger", JSON.stringify(lightLedger));
  } catch (e) {
    console.warn("localStorage save failed for fc_ledger due to quota limits:", e);
  }
  syncToServer();
}

function saveProductsToStorage() {
  try {
    localStorage.setItem("fc_products", JSON.stringify(state.products));
  } catch (e) {
    console.warn("localStorage save failed for products:", e);
  }
  syncToServer();
}

function saveTransactionsToStorage() {
  try {
    localStorage.setItem("fc_transactions", JSON.stringify(state.transactions));
  } catch (e) {
    console.warn("localStorage save failed for transactions:", e);
  }
  syncToServer();
}

// ----------------------------------------------------
// NAVIGATION SYSTEM
// ----------------------------------------------------
function setupNavigation() {
  const navItems = document.querySelectorAll(".nav-item");
  const pages = document.querySelectorAll(".page-view");
  const sidebar = document.getElementById("sidebar");
  const menuToggle = document.getElementById("mobile-menu-toggle");

  // Mobile menu toggle click listener
  if (menuToggle && sidebar) {
    menuToggle.addEventListener("click", () => {
      sidebar.classList.toggle("menu-open");
    });
  }

  navItems.forEach(item => {
    item.addEventListener("click", () => {
      const targetPage = item.getAttribute("data-page");
      
      // Auto-collapse mobile menu when a nav link is clicked
      if (sidebar) {
        sidebar.classList.remove("menu-open");
      }

      // Update sidebar active class
      navItems.forEach(nav => nav.classList.remove("active"));
      item.classList.add("active");

      // Toggle visible page
      pages.forEach(page => {
        page.classList.remove("active");
        if (page.id === `${targetPage}-view`) {
          page.classList.add("active");
        }
      });

      state.activePage = targetPage;
      renderAll();

      // Auto focus scanner input when switching to POS
      if (targetPage === 'pos') {
        setTimeout(() => {
          const scannerInput = document.getElementById("pos-scanner-sim-input");
          if (scannerInput) scannerInput.focus();
        }, 100);
      }
    });
  });
}

function renderAll() {
  if (state.activePage === 'dashboard') {
    renderDashboard();
  } else if (state.activePage === 'pos') {
    renderPOSCatalog();
    renderPOSCart();
    updatePOSCustomerDatalists();
  } else if (state.activePage === 'inventory') {
    renderInventory();
    renderInventoryCategoriesFilter();
  } else if (state.activePage === 'transactions') {
    renderTransactions();
  } else if (state.activePage === 'ledger') {
    renderLedger();
  }
}

// Helper: Format Currency (Rupee Format)
function formatRupee(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2
  }).format(amount);
}

// Helper: Format Date
function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }) + " " + date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

// ----------------------------------------------------
// VIEW 1: DASHBOARD RENDER
// ----------------------------------------------------
function renderDashboard() {
  const todayStr = new Date().toISOString().split('T')[0];
  
  // 1. Calculations for Statistics
  // Filter today's completed transactions
  const todaysTxns = state.transactions.filter(t => t.date.startsWith(todayStr));
  
  const totalSalesToday = todaysTxns.reduce((acc, curr) => acc + curr.totalPayable, 0);
  const totalGstToday = todaysTxns.reduce((acc, curr) => acc + curr.gstAmount, 0);
  const totalProducts = state.products.length;
  const lowStockCount = state.products.filter(p => p.stock <= p.reorderLevel).length;

  // Update elements
  document.getElementById("stat-sales").innerText = formatRupee(totalSalesToday);
  document.getElementById("stat-products").innerText = totalProducts;
  document.getElementById("stat-lowstock").innerText = lowStockCount;
  document.getElementById("stat-gst").innerText = formatRupee(totalGstToday);

  // Toggle low stock warning badge color
  const lowStockCard = document.querySelector(".stat-card.lowstock");
  if (lowStockCount > 0) {
    lowStockCard.style.borderColor = "var(--warning)";
  } else {
    lowStockCard.style.borderColor = "var(--border-color)";
  }

  // 2. Render Recent Billings List
  const recentList = document.getElementById("dashboard-recent-list");
  recentList.innerHTML = "";
  
  // Sort transactions by date descending, take top 5
  const sortedTxns = [...state.transactions]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5);

  if (sortedTxns.length === 0) {
    recentList.innerHTML = `<div style="text-align:center; color:var(--text-muted); font-size:13px; padding:20px;">No recent transactions.</div>`;
  } else {
    sortedTxns.forEach(txn => {
      const item = document.createElement("div");
      item.className = "activity-item";
      item.innerHTML = `
        <div class="activity-info">
          <h4>${txn.id}</h4>
          <p>${txn.customerName || "Walk-in Customer"} &bull; ${txn.paymentMethod}</p>
        </div>
        <div class="activity-amount">${formatRupee(txn.totalPayable)}</div>
      `;
      recentList.appendChild(item);
    });
  }

  // 3. Render Sales Trends Chart (SVG)
  renderSalesTrendChart();
}

function renderSalesTrendChart() {
  const container = document.getElementById("dashboard-chart-container");
  if (!container) return;

  // Get data for past 7 days
  const chartData = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    
    // Filter sales on this day
    const daySales = state.transactions
      .filter(t => t.date.startsWith(dateStr))
      .reduce((acc, curr) => acc + curr.totalPayable, 0);

    chartData.push({
      label: date.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit' }),
      value: daySales
    });
  }

  // Draw custom SVG
  const width = container.clientWidth || 500;
  const height = 280;
  const paddingX = 60;
  const paddingY = 40;

  const maxVal = Math.max(...chartData.map(d => d.value), 1000); // minimum scale peak at 1000
  const yMultiplier = (height - paddingY * 2) / maxVal;
  const xSpacer = (width - paddingX * 2) / (chartData.length - 1);

  // SVG Shell
  let svgContent = `
    <svg viewBox="0 0 ${width} ${height}" class="chart-svg">
      <defs>
        <linearGradient id="chart-gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--primary)" stop-opacity="0.4"/>
          <stop offset="100%" stop-color="var(--primary)" stop-opacity="0.0"/>
        </linearGradient>
      </defs>
  `;

  // Draw Horizontal Grid Lines
  const gridLinesCount = 4;
  for (let i = 0; i <= gridLinesCount; i++) {
    const gridY = paddingY + (height - paddingY * 2) * (i / gridLinesCount);
    const gridValue = maxVal * (1 - i / gridLinesCount);
    svgContent += `
      <line x1="${paddingX}" y1="${gridY}" x2="${width - paddingX}" y2="${gridY}" class="chart-grid-line" />
      <text x="${paddingX - 10}" y="${gridY + 4}" fill="var(--text-muted)" font-size="10" text-anchor="end">${Math.round(gridValue)}</text>
    `;
  }

  // Calculate Chart Coordinate Points
  const points = chartData.map((d, index) => {
    const x = paddingX + index * xSpacer;
    const y = height - paddingY - d.value * yMultiplier;
    return { x, y, value: d.value, label: d.label };
  });

  // Area Path
  let areaD = `M ${points[0].x} ${height - paddingY}`;
  points.forEach(p => {
    areaD += ` L ${p.x} ${p.y}`;
  });
  areaD += ` L ${points[points.length - 1].x} ${height - paddingY} Z`;
  svgContent += `<path d="${areaD}" class="chart-area" />`;

  // Line Path
  let lineD = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    lineD += ` L ${points[i].x} ${points[i].y}`;
  }
  svgContent += `<path d="${lineD}" class="chart-line" />`;

  // Interactive points & Date labels
  points.forEach(p => {
    // Circle
    svgContent += `
      <circle cx="${p.x}" cy="${p.y}" r="5" class="chart-point" data-val="${p.value}" data-lbl="${p.label}" />
    `;
    // Label x-axis
    svgContent += `
      <text x="${p.x}" y="${height - paddingY + 20}" fill="var(--text-secondary)" font-size="11" text-anchor="middle" font-weight="500">${p.label}</text>
    `;
  });

  svgContent += `</svg>`;
  container.innerHTML = svgContent;

  // Add Tooltip interactions
  const tooltip = document.createElement("div");
  tooltip.className = "chart-tooltip";
  container.appendChild(tooltip);

  const circles = container.querySelectorAll(".chart-point");
  circles.forEach(circle => {
    circle.addEventListener("mouseenter", (e) => {
      const val = parseFloat(e.target.getAttribute("data-val"));
      const lbl = e.target.getAttribute("data-lbl");
      
      tooltip.innerHTML = `<strong>${lbl}</strong><br>Sales: ${formatRupee(val)}`;
      tooltip.style.display = "block";
      
      const parentRect = container.getBoundingClientRect();
      const circleX = e.target.cx.baseVal.value;
      const circleY = e.target.cy.baseVal.value;
      
      tooltip.style.left = `${circleX - tooltip.offsetWidth / 2}px`;
      tooltip.style.top = `${circleY - tooltip.offsetHeight - 10}px`;
    });

    circle.addEventListener("mouseleave", () => {
      tooltip.style.display = "none";
    });
  });
}

// ----------------------------------------------------
// VIEW 2: POS CATALOG & BILLING
// ----------------------------------------------------
let posSelectedCategory = "all";
let posSearchQuery = "";



function renderPOSCatalog() {
  const catalogGrid = document.getElementById("pos-catalog-grid");
  if (!catalogGrid) return;
  catalogGrid.innerHTML = "";

  // Filter products strictly by query (categories tabs removed from POS)
  const filteredProducts = state.products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(posSearchQuery.toLowerCase()) || 
                          p.sku.includes(posSearchQuery);
    return matchesSearch;
  });

  if (filteredProducts.length === 0) {
    const cleanSearch = posSearchQuery.trim();
    if (cleanSearch.length > 0) {
      catalogGrid.innerHTML = `
        <div style="grid-column: span 4; text-align:center; padding:40px 20px; background:var(--bg-main); border:1px dashed var(--border-color); border-radius:8px;">
          <p style="color:var(--text-secondary); font-size:14px; margin-bottom:12px;">"${cleanSearch}" not found in inventory catalog.</p>
          <button class="btn btn-primary" onclick="window.openPosQuickAddModal('${cleanSearch.replace(/'/g, "\\'")}')" style="background:#8B5CF6; border-color:#7C3AED; color:#fff; padding:8px 16px; font-size:13px; font-weight:600; cursor:pointer;">
            + Add New Product
          </button>
        </div>
      `;
    } else {
      catalogGrid.innerHTML = `<div style="grid-column: span 4; text-align:center; color:var(--text-muted); font-size:14px; padding:30px;">No products in catalog.</div>`;
    }
    return;
  }

  filteredProducts.forEach(prod => {
    const card = document.createElement("div");
    card.className = "product-item-card";
    
    let stockClass = "stock-ok";
    let stockText = `${prod.stock} ${prod.unit} left`;
    
    if (prod.stock <= 0) {
      stockClass = "stock-empty";
      stockText = "Out of stock";
    } else if (prod.stock <= prod.reorderLevel) {
      stockClass = "stock-low";
      stockText = "Low stock";
    }

    card.innerHTML = `
      <div>
        <span class="item-sku-badge">${prod.sku}</span>
        <span class="item-gst-tag">${prod.gstSlab}% GST</span>
        <h3 class="item-name">${prod.name}</h3>
      </div>
      <div class="item-bottom">
        <span class="item-price">${formatRupee(prod.sellingPrice)}</span>
        <span class="item-stock ${stockClass}">${stockText}</span>
      </div>
    `;

    // Click handler to add to cart (Allows billing even if out of stock)
    card.addEventListener("click", () => {
      addToCart(prod.sku);
    });

    catalogGrid.appendChild(card);
  });
}

function suggestHsn(nameVal) {
  nameVal = nameVal.toLowerCase().trim();
  if (/\b(soap|bath|body wash|cinthol|dettol|lifebuoy|dove|lux|pears|godrej no\.? 1|santoor|liril|savlon|fiama|handwash|hand wash)\b/.test(nameVal)) return "3401";
  if (/\b(shampoo|hair oil|conditioner|parachute|clinic plus|pantene|sunsilk|almond drop|hair color|dye|garnier|loreal|haircream)\b/.test(nameVal)) return "3305";
  if (/\b(toothpaste|brush|colgate|sensodyne|pepsodent|close up|dabur red|oral|toothbrush|dant|dentobac|meswak)\b/.test(nameVal)) return "3306";
  if (/\b(detergent|wash|powder|surf|wheel|tide|ariel|vim|rin|harpic|lizol|cleaner|phenyle|comfort|colin|phenyl|acid|bleach|scrub|ezee|safewash)\b/.test(nameVal)) return "3402";
  if (/\b(agarbatti|dhoop|incense|camphor|kapoor|pooja|havan|samagri|cotton wicks|mangaldeep|cycle agarbatti)\b/.test(nameVal)) return "3307";
  if (/\b(good knight|goodknight|hit|mortein|all out|allout|mosquito|repellent|coil|insecticide|pest|spray)\b/.test(nameVal)) return "3808";
  if (/\b(stayfree|stay free|whisper|sofy|sanitary|napkin|pad|pads)\b/.test(nameVal)) return "9619";
  if (/\b(diaper|diapers|pampers|huggies|mamypoko|mamy poko|baby wipe|baby wipes)\b/.test(nameVal)) return "9619";
  if (/\b(cola|coke|pepsi|sprite|fanta|thums up|thumsup|limca|dew|soda|aerated|soft drink|carbonated|maaza|frooti|slice|tropicana|real juice|real|juice|juices|drink|drinks|paper boat|b-natural|bnatural)\b/.test(nameVal)) return "2202";
  if (/\b(water|mineral water|bisleri|kinley|aquafina|aquasure|himalayan)\b/.test(nameVal)) return "2201";
  if (/\b(sauce|ketchup|jam|mayonnaise|spread|kissans|kissan|shezwan|chutney|vinegar|soya sauce|chilli sauce)\b/.test(nameVal)) return "2103";
  if (/\b(pickle|pickles|achar|achari)\b/.test(nameVal)) return "2001";
  if (/\b(biscuit|cookie|cookies|marie|gold|parle|britannia|crackjack|monaco|oreo|hide seek|rusk|hide \& seek|unibic|sunfeast|moms magic)\b/.test(nameVal)) return "1905";
  if (/\b(chocolate|cadbury|dairy milk|kitkat|munch|perk|5 star|fivestar|snickers|choco|milkybar|eclairs|melody|cough drop|lozenge|candy|candies|gems)\b/.test(nameVal)) return "1806";
  if (/\b(noodle|noodles|maggi|yippee|pasta|macaroni|knorr|soup|vermicelli|chowmein|ramen)\b/.test(nameVal)) return "1902";
  if (/\b(chips|lays|kurkure|namkeen|bhujia|bingo|snack|puff|popcorn|mixture|sev|gathiya|murukku|aloo bhujia|chana chur)\b/.test(nameVal)) return "2106";
  if (/\b(ghee|butter|amul|mother dairy|paneer|cheese|cream)\b/.test(nameVal)) return "0405";
  if (/\b(mustard oil|fortune oil|refined oil|soya oil|canola oil|rice bran|safola|edible oil|coconut oil|dhara|saffola|oil|oils)\b/.test(nameVal)) return "1512";
  if (/\b(tea|coffee|nescafe|bru|red label|taj mahal|tata tea|taj|ctc|dust|filter coffee)\b/.test(nameVal)) return "0902";
  if (/\b(spice|masala|haldi|mirch|dhaniya|turmeric|chilli|mdh|everest|catch|powder|cardamom|elaichi|jeera|cumin|mustard seeds|sarso|methi|clove)\b/.test(nameVal)) return "0910";
  if (/\b(honey|dabur honey|patanjali honey)\b/.test(nameVal)) return "0409";
  if (/\b(papad|lijjat)\b/.test(nameVal)) return "1905";
  if (/\b(salt|tata salt)\b/.test(nameVal)) return "2501";
  if (/\b(atta|flour|maida|suji|besan|ashirvaad|aata|wheat flour)\b/.test(nameVal)) return "1101";
  if (/\b(rice|basmati|puls|dal|moong|chana|rajma|pulses|urad|arhar|masoor|toor|kabuli)\b/.test(nameVal)) return "1006";
  if (/\b(sugar|chini|shakkar|jaggery|gur)\b/.test(nameVal)) return "1701";
  return "2106";
}

window.openPosQuickAddModal = function(query) {
  const quickAddModal = document.getElementById("pos-quick-add-modal");
  if (!quickAddModal) return;

  document.getElementById("quick-add-name").value = query || "";
  document.getElementById("quick-add-price").value = "";
  
  // Auto-suggest GST slab based on product name
  const suggestedGst = suggestHsn(query) === "2501" || (suggestHsn(query) === "1905" && !query.toLowerCase().includes("biscuit")) ? "0" : 
                        ["0902", "0910", "1101", "1006", "1701"].includes(suggestHsn(query)) ? "5" :
                        ["0405", "2106", "2001"].includes(suggestHsn(query)) ? "12" : "18";
  
  document.getElementById("quick-add-gst").value = suggestedGst;

  quickAddModal.classList.add("active");
  
  setTimeout(() => {
    document.getElementById("quick-add-price").focus();
  }, 100);
};

function setupPOSCartActions() {
  // Search input change
  const searchInput = document.getElementById("pos-search-input");
  searchInput.addEventListener("input", (e) => {
    posSearchQuery = e.target.value;
    renderPOSCatalog();
  });

  // Client Datalist autofill hooks
  const phoneInput = document.getElementById("pos-customer-phone");
  const nameInput = document.getElementById("pos-customer-name");

  phoneInput.addEventListener("input", (e) => {
    const phone = e.target.value.trim();
    if (phone.length === 10) {
      const existing = state.customers.find(c => c.phone === phone);
      if (existing) {
        nameInput.value = existing.name;
        // visual success glow
        phoneInput.style.borderColor = "var(--primary)";
        nameInput.style.borderColor = "var(--primary)";
        setTimeout(() => {
          phoneInput.style.borderColor = "var(--border-color)";
          nameInput.style.borderColor = "var(--border-color)";
        }, 1000);
      }
    }
  });

  nameInput.addEventListener("change", (e) => {
    const name = e.target.value.trim();
    const existing = state.customers.find(c => c.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      phoneInput.value = existing.phone;
      // visual success glow
      phoneInput.style.borderColor = "var(--primary)";
      nameInput.style.borderColor = "var(--primary)";
      setTimeout(() => {
        phoneInput.style.borderColor = "var(--border-color)";
        nameInput.style.borderColor = "var(--border-color)";
      }, 1000);
    }
  });

  // Close POS Quick Add Modal listeners
  const quickAddModal = document.getElementById("pos-quick-add-modal");
  const closeQuickAdd = () => quickAddModal.classList.remove("active");
  
  document.getElementById("pos-quick-add-modal-close-btn").addEventListener("click", closeQuickAdd);
  document.getElementById("pos-quick-add-modal-cancel-btn").addEventListener("click", closeQuickAdd);
  
  // Quick Add Form submit handler
  document.getElementById("pos-quick-add-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("quick-add-name").value.trim();
    const price = parseFloat(document.getElementById("quick-add-price").value);
    const gst = parseInt(document.getElementById("quick-add-gst").value);
    const unitInput = document.getElementById("quick-add-unit");
    const unit = unitInput ? unitInput.value : "pcs";

    if (!name || isNaN(price) || price <= 0) {
      alert("Please enter a valid Product Name and Price.");
      return;
    }

    // Generate local unique SKU
    const sku = "LOCAL_" + Math.random().toString(36).substr(2, 8).toUpperCase();
    
    // Auto-suggest HSN based on product name
    const hsn = suggestHsn(name);

    // Create permanent product in inventory catalog
    const newProduct = {
      sku,
      name,
      category: "General FMCG",
      hsn,
      costPrice: Number((price * 0.8).toFixed(2)), // default ~20% margin
      sellingPrice: price,
      gstSlab: gst,
      stock: 100, // seed initial stock
      reorderLevel: 5,
      unit: unit,
      discountPercent: 0
    };

    state.products.push(newProduct);
    saveProductsToStorage();
    
    // Add to cart
    addToCart(sku);

    // Clear search query & input
    document.getElementById("pos-search-input").value = "";
    posSearchQuery = "";
    
    renderPOSCatalog();
    closeQuickAdd();
  });

  // Clear Cart
  document.getElementById("pos-clear-cart-btn").addEventListener("click", () => {
    state.cart = [];
    renderPOSCart();
  });

  // Discount changes
  document.getElementById("pos-discount-type").addEventListener("change", renderPOSCart);
  document.getElementById("pos-discount-value").addEventListener("input", renderPOSCart);

  // Checkout Button
  document.getElementById("pos-checkout-btn").addEventListener("click", checkoutCart);
  
  // Close Receipt Modal
  document.getElementById("receipt-close-btn").addEventListener("click", () => {
    document.getElementById("receipt-modal").classList.remove("active");
  });
  
  // Print Button inside modal
  document.getElementById("receipt-print-btn").addEventListener("click", () => {
    window.print();
  });
}

function addToCart(sku) {
  const product = state.products.find(p => p.sku === sku);
  if (!product) return;

  const existingIndex = state.cart.findIndex(item => (item.product.sku || item.product.id) === sku);
  
  if (existingIndex !== -1) {
    const existing = state.cart[existingIndex];
    existing.quantity = Number((existing.quantity + 1).toFixed(2));
    // Move updated item to the top of the cart array so it is immediately visible!
    state.cart.splice(existingIndex, 1);
    state.cart.unshift(existing);
  } else {
    // Unshift new item to the top of the cart array!
    state.cart.unshift({
      product: { ...product },
      quantity: 1
    });
  }

  renderPOSCart();
  playBeep(); // Trigger scanner simulated beep sound on add!
}

function changeCartQty(sku, delta) {
  const cartItem = state.cart.find(item => item.product.sku === sku);
  if (!cartItem) return;

  cartItem.quantity = Number((cartItem.quantity + delta).toFixed(2));
  if (cartItem.quantity <= 0.001) {
    state.cart = state.cart.filter(item => item.product.sku !== sku);
  }

  renderPOSCart();
}

window.updateCartItemQtyDirectly = function(sku, value) {
  const cartItem = state.cart.find(item => item.product.sku === sku);
  if (!cartItem) return;

  let qty = parseFloat(value);
  if (isNaN(qty) || qty <= 0) {
    qty = 1;
  }

  cartItem.quantity = Number(qty.toFixed(2));
  renderPOSCart();
};

window.updateCartItemPriceDirectly = function(sku, value) {
  const cartItem = state.cart.find(item => item.product.sku === sku);
  if (!cartItem) return;

  let price = parseFloat(value);
  if (isNaN(price) || price < 0) {
    price = 0;
  }

  cartItem.product.sellingPrice = price;
  renderPOSCart();
};

function deleteCartItem(sku) {
  state.cart = state.cart.filter(item => item.product.sku !== sku);
  renderPOSCart();
}

function renderPOSCart() {
  const cartWrapper = document.getElementById("pos-cart-items");
  const emptyState = document.getElementById("pos-empty-state");
  const cartCountTag = document.getElementById("pos-cart-count");

  // Clear previous list, keeping empty state helper
  const listItems = cartWrapper.querySelectorAll(".cart-item");
  listItems.forEach(item => item.remove());

  if (state.cart.length === 0) {
    emptyState.style.display = "flex";
    cartCountTag.innerText = "0 Items";
    
    // Clear display amounts
    document.getElementById("summary-subtotal").innerText = formatRupee(0);
    const taxTotalEl = document.getElementById("summary-tax-total");
    if (taxTotalEl) taxTotalEl.innerText = formatRupee(0);
    document.getElementById("summary-cgst").innerText = formatRupee(0);
    document.getElementById("summary-sgst").innerText = formatRupee(0);
    document.getElementById("summary-discount").innerText = formatRupee(0);
    document.getElementById("summary-total").innerText = formatRupee(0);
    return;
  }

  emptyState.style.display = "none";
  
  const totalQty = state.cart.reduce((acc, curr) => acc + curr.quantity, 0);
  cartCountTag.innerText = `${Number(totalQty.toFixed(2))} items`;

  // 1. Calculate Totals
  let grossTotal = 0; // Cumulative inclusive value before discounts
  
  state.cart.forEach(item => {
    const discountPct = item.product.discountPercent || 0;
    const netUnitPrice = item.product.sellingPrice * (1 - discountPct / 100);
    const lineTotal = netUnitPrice * item.quantity;
    grossTotal += lineTotal;

    const step = item.product.unit === 'kg' ? 0.1 : 1;

    // Price input box to dynamically change sellingPrice
    let priceDetails = `₹<input type="number" class="price-input-box" value="${item.product.sellingPrice.toFixed(2)}" step="0.01" style="width:75px; text-align:center; background:var(--bg-main); border:1px solid var(--border-color); border-radius:4px; font-size:12px; color:var(--text-primary); font-weight:600; padding:2px; display:inline-block;" onchange="window.updateCartItemPriceDirectly('${item.product.sku || item.product.id}', this.value)"> per ${item.product.unit || 'pcs'} &bull; GST ${parseFloat(item.product.gstSlab ?? item.product.gstRate ?? 0)}%`;
    if (discountPct > 0) {
      priceDetails = `<span style="color:var(--success); font-weight:700;">${formatRupee(netUnitPrice)}</span> per ${item.product.unit || 'pcs'} (Base: ₹<input type="number" class="price-input-box" value="${item.product.sellingPrice.toFixed(2)}" step="0.01" style="width:75px; text-align:center; background:var(--bg-main); border:1px solid var(--border-color); border-radius:4px; font-size:12px; color:var(--text-primary); font-weight:600; padding:2px; display:inline-block;" onchange="window.updateCartItemPriceDirectly('${item.product.sku || item.product.id}', this.value)">) <span class="badge badge-success" style="font-size:10px; padding:1px 4px; margin-left:4px;">${discountPct}% off</span> &bull; GST ${parseFloat(item.product.gstSlab ?? item.product.gstRate ?? 0)}%`;
    }

    const div = document.createElement("div");
    div.className = "cart-item";
    div.innerHTML = `
      <div class="cart-item-details">
        <h4>${item.product.name}</h4>
        <p>${priceDetails}</p>
      </div>
      <div class="cart-item-qty">
        <button class="qty-btn" onclick="changeCartQty('${item.product.sku || item.product.id}', -${step})">-</button>
        <input type="number" class="qty-input-box" value="${item.quantity}" min="0.01" step="${step}" style="width:55px; text-align:center; background:var(--bg-main); border:1px solid var(--border-color); border-radius:4px; font-size:13px; color:var(--text-primary); font-weight:600; padding:2px;" onchange="updateCartItemQtyDirectly('${item.product.sku || item.product.id}', this.value)">
        <button class="qty-btn" onclick="changeCartQty('${item.product.sku || item.product.id}', ${step})">+</button>
      </div>
      <div class="cart-item-price">${formatRupee(lineTotal)}</div>
      <div class="cart-item-delete" onclick="deleteCartItem('${item.product.sku || item.product.id}')">Remove item</div>
    `;
    cartWrapper.appendChild(div);
  });

  // Calculate discount
  const discType = document.getElementById("pos-discount-type").value;
  const discVal = parseFloat(document.getElementById("pos-discount-value").value) || 0;
  let totalDiscount = 0;

  if (discType === 'flat') {
    totalDiscount = Math.min(discVal, grossTotal);
  } else if (discType === 'percentage') {
    totalDiscount = (grossTotal * Math.min(discVal, 100)) / 100;
  }

  let totalTaxableSubtotal = 0;
  let totalGstAmount = 0;

  state.cart.forEach(item => {
    const itemInclusiveTotal = item.product.sellingPrice * item.quantity;
    const proportionalDiscount = grossTotal > 0 ? (itemInclusiveTotal / grossTotal) * totalDiscount : 0;
    const netItemInclusive = itemInclusiveTotal - proportionalDiscount;
    
    const gstSlab = parseFloat(item.product.gstSlab ?? item.product.gstRate ?? 0);
    const baseTaxable = netItemInclusive / (1 + gstSlab / 100);
    const gstValue = netItemInclusive - baseTaxable;

    totalTaxableSubtotal += baseTaxable;
    totalGstAmount += gstValue;
  });

  const payableTotal = grossTotal - totalDiscount;

  // Split GST 50-50 for intra-state Indian sales (CGST & SGST)
  const cgstAmount = totalGstAmount / 2;
  const sgstAmount = totalGstAmount / 2;

  // Update summary fields
  document.getElementById("summary-subtotal").innerText = formatRupee(totalTaxableSubtotal);
  const taxTotalEl = document.getElementById("summary-tax-total");
  if (taxTotalEl) taxTotalEl.innerText = formatRupee(totalGstAmount);
  document.getElementById("summary-cgst").innerText = formatRupee(cgstAmount);
  document.getElementById("summary-sgst").innerText = formatRupee(sgstAmount);
  document.getElementById("summary-discount").innerText = "-" + formatRupee(totalDiscount);
  document.getElementById("summary-total").innerText = formatRupee(payableTotal);

  // Focus the top of the cart list where newly added/scanned items are unshifted
  if (cartWrapper) {
    cartWrapper.scrollTop = 0;
  }
}

function setupSidebarToggle() {
  const collapseBtn = document.getElementById("sidebar-collapse-btn");
  const sidebar = document.getElementById("sidebar");
  if (!collapseBtn || !sidebar) return;

  // Restore saved collapse preference
  const isCollapsed = localStorage.getItem("sidebar_collapsed") === "true";
  if (isCollapsed) {
    sidebar.classList.add("collapsed");
  }

  collapseBtn.addEventListener("click", () => {
    sidebar.classList.toggle("collapsed");
    localStorage.setItem("sidebar_collapsed", sidebar.classList.contains("collapsed"));
  });
}

// ----------------------------------------------------
// SCANNER SIMULATOR & AUDIO LOGIC
// ----------------------------------------------------
function setupScannerSimulator() {
  const scanInput = document.getElementById("pos-scanner-sim-input");
  const scannerCard = document.getElementById("scanner-sim-card");

  if (scanInput && scannerCard) {
    scanInput.addEventListener("focus", () => {
      scannerCard.classList.add("active");
    });

    scanInput.addEventListener("blur", () => {
      scannerCard.classList.remove("active");
    });

    scanInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const sku = scanInput.value.trim();
        if (!sku) return;

        const prod = state.products.find(p => p.sku === sku);
        if (prod) {
          addToCart(sku);
        } else {
          alert(`Product with SKU "${sku}" not found in inventory.`);
        }
        scanInput.value = "";
        scanInput.focus();
      }
    });
  }

  // Global keypress listener - if user is on POS billing view and starts typing a number, redirect focus to pos search input
  window.addEventListener("keydown", (e) => {
    if (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "SELECT") {
      return;
    }
    
    if (state.activePage === 'pos') {
      const searchInput = document.getElementById("pos-search-input");
      if (searchInput && /^[a-zA-Z0-9]$/.test(e.key)) {
        searchInput.focus();
      }
    }
  });
}

// Play Scanner Beep Sound using Web Audio API
function playBeep() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(1050, audioCtx.currentTime); // High pitch retail chirp
    gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime);
    
    // Short exponential decay for clean crisp beep click
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.09);
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.1);
  } catch (e) {
    console.warn("Audio Context blocked or unsupported.", e);
  }
}

// ----------------------------------------------------
// CHECKOUT & RECEIPT ENGINE
// ----------------------------------------------------
function checkoutCart() {
  if (state.cart.length === 0) return;

  const nameInput = document.getElementById("pos-customer-name");
  const phoneInput = document.getElementById("pos-customer-phone");
  const payMethod = document.getElementById("pos-payment-method").value;

  const customerName = nameInput.value.trim();
  const customerPhone = phoneInput.value.trim();

  // Validate phone if credit or provided
  if (payMethod === 'Credit') {
    if (!customerName || !customerPhone || !/^\d{10}$/.test(customerPhone)) {
      alert("Customer Name and a valid 10-digit Indian Phone Number are required for Credit/Khata transactions.");
      return;
    }
  } else if (customerPhone && !/^\d{10}$/.test(customerPhone)) {
    alert("Please enter a valid 10-digit Indian Mobile Number.");
    return;
  }

  // Calculate numbers
  let grossTotal = 0;
  state.cart.forEach(item => {
    const discountPct = item.product.discountPercent || 0;
    const netUnitPrice = item.product.sellingPrice * (1 - discountPct / 100);
    grossTotal += netUnitPrice * item.quantity;
  });

  const discType = document.getElementById("pos-discount-type").value;
  const discVal = parseFloat(document.getElementById("pos-discount-value").value) || 0;
  let totalDiscount = 0;

  if (discType === 'flat') {
    totalDiscount = Math.min(discVal, grossTotal);
  } else if (discType === 'percentage') {
    totalDiscount = (grossTotal * Math.min(discVal, 100)) / 100;
  }

  // Calculate detailed taxes per item and total base values
  let totalTaxableSubtotal = 0;
  let totalGstAmount = 0;
  const detailedInvoiceItems = [];

  state.cart.forEach(item => {
    const discountPct = item.product.discountPercent || 0;
    const netUnitPrice = item.product.sellingPrice * (1 - discountPct / 100);
    const itemInclusiveTotal = netUnitPrice * item.quantity;
    const proportionalDiscount = grossTotal > 0 ? (itemInclusiveTotal / grossTotal) * totalDiscount : 0;
    const netItemInclusive = itemInclusiveTotal - proportionalDiscount;
    
    const baseTaxable = netItemInclusive / (1 + item.product.gstSlab / 100);
    const gstValue = netItemInclusive - baseTaxable;

    totalTaxableSubtotal += baseTaxable;
    totalGstAmount += gstValue;

    detailedInvoiceItems.push({
      sku: item.product.sku,
      name: item.product.name,
      hsn: item.product.hsn || "9999",
      sellingPrice: netUnitPrice,
      originalPrice: item.product.sellingPrice,
      discountPercent: discountPct,
      quantity: item.quantity,
      gstSlab: item.product.gstSlab,
      taxableValue: baseTaxable,
      gstValue: gstValue
    });

    // Deduct stock in local inventory registry (if not custom item)
    if (!item.product.isCustom) {
      const realProduct = state.products.find(p => p.sku === item.product.sku);
      if (realProduct) {
        realProduct.stock = Math.max(0, realProduct.stock - item.quantity);
        // Sync modified price to inventory database!
        if (realProduct.sellingPrice !== item.product.sellingPrice) {
          realProduct.sellingPrice = item.product.sellingPrice;
          console.log(`Updated inventory price of ${realProduct.name} to ₹${realProduct.sellingPrice}`);
        }
      }
    }
  });

  const payableTotal = grossTotal - totalDiscount;
  const cgstAmount = totalGstAmount / 2;
  const sgstAmount = totalGstAmount / 2;

  // Save inventory changes
  saveProductsToStorage();

  // Create new transaction object
  const txnId = `TXN-${Math.floor(100000 + Math.random() * 900000)}`;
  const transaction = {
    id: txnId,
    date: new Date().toISOString(),
    customerName: customerName || "Walk-in Customer",
    customerPhone: customerPhone || "",
    items: detailedInvoiceItems,
    subtotal: totalTaxableSubtotal,
    discountType: discType,
    discountValue: discVal,
    discountAmount: totalDiscount,
    gstAmount: totalGstAmount,
    totalPayable: payableTotal,
    paymentMethod: payMethod
  };

  // Post atomic transaction to server database
  try {
    await fetch('/api/add-transaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify(transaction)
    });
  } catch(err) {
    console.error("Atomic add-transaction error:", err);
  }

  // Refresh server state across devices
  await initData();

  // Clear cart
  state.cart = [];
  nameInput.value = "";
  phoneInput.value = "";
  document.getElementById("pos-discount-value").value = "0";

  // Build receipt html template and show modal
  buildReceiptInvoice(transaction);
  
  // Show Receipt Modal
  document.getElementById("receipt-invoice-id").innerText = `Invoice No: ${txnId}`;
  document.getElementById("receipt-modal").classList.add("active");

  renderAll();

  // Auto-Print Receipt if active
  if (state.settings.auto_print === "true") {
    const textReceipt = generateTextReceipt(transaction);
    sendReceiptToPrinter(textReceipt);
  }
}

function buildReceiptInvoice(txn) {
  state.lastTransaction = txn;
  const receiptArea = document.getElementById("receipt-print-area");
  if (!receiptArea) return;

  let itemsRows = "";
  txn.items.forEach((item, idx) => {
    const rateBeforeTax = item.sellingPrice / (1 + item.gstSlab / 100);
    const amountBeforeTax = rateBeforeTax * item.quantity;
    let discountInfo = "";
    if (item.discountPercent > 0) {
      discountInfo = ` (Incl. ${item.discountPercent}% disc, MRP: ₹${item.originalPrice.toFixed(2)})`;
    }
    itemsRows += `
      <tr>
        <td colspan="5" style="font-weight:700;">${idx+1}. ${item.name}${discountInfo}</td>
      </tr>
      <tr>
        <td style="color:#374151;">HSN:${item.hsn}</td>
        <td style="color:#374151;">${item.quantity} pcs</td>
        <td style="color:#374151;">₹${rateBeforeTax.toFixed(2)}</td>
        <td style="color:#374151;">${item.gstSlab}%</td>
        <td style="text-align:right; font-weight:600;">₹${(item.sellingPrice * item.quantity).toFixed(2)}</td>
      </tr>
    `;
  });

  // Calculate detailed GST rates breakdown summaries
  const gstGroups = {};
  txn.items.forEach(item => {
    if (!gstGroups[item.gstSlab]) {
      gstGroups[item.gstSlab] = { taxable: 0, gst: 0 };
    }
    gstGroups[item.gstSlab].taxable += item.taxableValue;
    gstGroups[item.gstSlab].gst += item.gstValue;
  });

  let gstBreakdownRows = "";
  Object.keys(gstGroups).forEach(slab => {
    const slabVal = parseInt(slab);
    const splitGstRate = slabVal / 2;
    const cgstSplit = gstGroups[slab].gst / 2;
    const sgstSplit = gstGroups[slab].gst / 2;
    
    gstBreakdownRows += `
      <div class="receipt-row" style="margin-bottom:2px; font-size:11px; color:#4B5563;">
        <span>GST ${slab}% (Taxable ₹${gstGroups[slab].taxable.toFixed(2)})</span>
        <span>CGST ${splitGstRate}%: ₹${cgstSplit.toFixed(2)} | SGST ${splitGstRate}%: ₹${sgstSplit.toFixed(2)}</span>
      </div>
    `;
  });

  receiptArea.innerHTML = `
    <div class="receipt-header">
      <div class="receipt-store-title">GULATI STORE</div>
      <div style="font-size:11px; color:#4B5563;">Shop No. 5 Sector 2 Naya Nangal</div>
      <div style="font-size:11px; color:#4B5563;">GSTIN: ${state.settings.gstin || '07AAAAA1111A1Z1'}</div>
      <div style="font-size:11px; color:#4B5563; margin-top:4px;">TAX INVOICE</div>
    </div>
    
    <div class="receipt-meta">
      <span>Date: ${formatDate(txn.date)}</span>
    </div>
    <div class="receipt-meta" style="margin-bottom:8px;">
      <span>Bill To: ${txn.customerName} (${txn.customerPhone || "Walk-in"})</span>
    </div>
    
    <table class="receipt-table">
      <thead>
        <tr>
          <th style="text-align:left;">Item / HSN</th>
          <th style="text-align:left;">Qty</th>
          <th style="text-align:left;">Rate</th>
          <th style="text-align:left;">GST</th>
          <th style="text-align:right;">Amt</th>
        </tr>
      </thead>
      <tbody>
        ${itemsRows}
      </tbody>
    </table>
    
    <div class="receipt-summary">
      <div class="receipt-row">
        <span>Taxable Subtotal:</span>
        <span>₹${txn.subtotal.toFixed(2)}</span>
      </div>
      <div class="receipt-row">
        <span>CGST Total:</span>
        <span>₹${(txn.gstAmount / 2).toFixed(2)}</span>
      </div>
      <div class="receipt-row">
        <span>SGST Total:</span>
        <span>₹${(txn.gstAmount / 2).toFixed(2)}</span>
      </div>
      <div class="receipt-row">
        <span>Discount:</span>
        <span>-₹${txn.discountAmount.toFixed(2)}</span>
      </div>
      <div class="receipt-row bold">
        <span>NET PAYABLE (Inclusive of Tax):</span>
        <span>₹${txn.totalPayable.toFixed(2)}</span>
      </div>
    </div>
    
    <div class="receipt-gst-breakdown" style="margin-top:12px;">
      <div style="font-weight:700; border-bottom:1px dashed #9CA3AF; padding-bottom:2px; margin-bottom:4px; font-size:11px;">GST TAX SPLIT BREAKDOWN:</div>
      ${gstBreakdownRows}
    </div>
    
    <div class="receipt-footer">
      <p style="font-weight:700; margin-bottom:4px;">Payment Method: ${txn.paymentMethod}</p>
      <p>Thank you for shopping with us!</p>
      <p>Have a wonderful day!</p>
    </div>
  `;

  // Set up WhatsApp button link dynamically
  const waBtn = document.getElementById("receipt-whatsapp-btn");
  if (waBtn) {
    const waMessage = formatWhatsAppReceipt(txn);
    const waUrl = txn.customerPhone 
      ? `https://wa.me/91${txn.customerPhone}?text=${encodeURIComponent(waMessage)}`
      : `https://wa.me/?text=${encodeURIComponent(waMessage)}`;
    
    waBtn.onclick = function() {
      window.open(waUrl, "_blank");
    };
  }
}

function formatWhatsAppReceipt(txn) {
  let msg = `*GULATI STORE TAX INVOICE*\n`;
  msg += `---------------------------------\n`;
  msg += `*Invoice No:* ${txn.id}\n`;
  msg += `*Date:* ${new Date(txn.date).toLocaleDateString('en-IN')}\n`;
  msg += `*Bill To:* ${txn.customerName} ${txn.customerPhone ? '(' + txn.customerPhone + ')' : ''}\n\n`;

  txn.items.forEach((item, idx) => {
    const rateBeforeTax = item.sellingPrice / (1 + item.gstSlab / 100);
    msg += `${idx + 1}. *${item.name}*\n`;
    if (item.discountPercent > 0) {
      msg += `   MRP: ₹${item.originalPrice.toFixed(2)} (${item.discountPercent}% Off)\n`;
    }
    msg += `   Qty: ${item.quantity} | Rate: ₹${rateBeforeTax.toFixed(2)} | GST: ${item.gstSlab}%\n`;
    msg += `   Total: ₹${(item.sellingPrice * item.quantity).toFixed(2)}\n`;
  });

  msg += `\n---------------------------------\n`;
  msg += `*Taxable Subtotal:* ₹${txn.subtotal.toFixed(2)}\n`;
  msg += `*CGST:* ₹${(txn.gstAmount / 2).toFixed(2)}\n`;
  msg += `*SGST:* ₹${(txn.gstAmount / 2).toFixed(2)}\n`;
  if (txn.discountAmount > 0) {
    msg += `*Discount:* -₹${txn.discountAmount.toFixed(2)}\n`;
  }
  msg += `*NET PAYABLE (Incl. Tax):* *₹${txn.totalPayable.toFixed(2)}*\n`;
  msg += `---------------------------------\n`;
  msg += `*Payment Method:* ${txn.paymentMethod}\n\n`;
  msg += `Thank you for shopping with us! Have a nice day!`;

  return msg;
}

// ----------------------------------------------------
// VIEW 3: INVENTORY MANAGEMENT
// ----------------------------------------------------
let invSearchQuery = "";
let invFilterCategory = "all";
let invFilterStock = "all";

function setupInventoryActions() {
  // Search bar
  document.getElementById("inv-search-input").addEventListener("input", (e) => {
    invSearchQuery = e.target.value;
    renderInventory();
  });

  // Filters
  document.getElementById("inv-filter-category").addEventListener("change", (e) => {
    invFilterCategory = e.target.value;
    renderInventory();
  });

  document.getElementById("inv-filter-stock").addEventListener("change", (e) => {
    invFilterStock = e.target.value;
    renderInventory();
  });

  // Add Product Button Modals
  const addModal = document.getElementById("product-modal");
  document.getElementById("inv-add-product-btn").addEventListener("click", () => {
    document.getElementById("product-modal-title").innerText = "Add New Product";
    document.getElementById("prod-edit-id").value = "";
    document.getElementById("product-form").reset();
    document.getElementById("prod-sku").disabled = false;
    
    // Clear auto-fill markers
    delete document.getElementById("prod-hsn").dataset.autoFilled;
    delete document.getElementById("prod-gst").dataset.autoFilled;
    
    addModal.classList.add("active");
  });

  // Smart HSN & GST Auto-Suggester based on product name
  const nameInput = document.getElementById("prod-name");
  if (nameInput) {
    nameInput.addEventListener("input", () => {
      const nameVal = nameInput.value.toLowerCase().trim();
      if (!nameVal) return;

      let hsn = "";
      let gst = "";

      // Smart pattern matching for common Indian packaged goods / FMCG
      if (/\b(soap|bath|body wash|cinthol|dettol|lifebuoy|dove|lux|pears|godrej no\.? 1|santoor|liril|savlon|fiama|handwash|hand wash)\b/.test(nameVal)) {
        hsn = "3401";
        gst = "18";
      } else if (/\b(shampoo|hair oil|conditioner|parachute|clinic plus|pantene|sunsilk|almond drop|hair color|dye|garnier|loreal|haircream)\b/.test(nameVal)) {
        hsn = "3305";
        gst = "18";
      } else if (/\b(toothpaste|brush|colgate|sensodyne|pepsodent|close up|dabur red|oral|toothbrush|dant|dentobac|meswak)\b/.test(nameVal)) {
        hsn = "3306";
        gst = "18";
      } else if (/\b(detergent|wash|powder|surf|wheel|tide|ariel|vim|rin|harpic|lizol|cleaner|phenyle|comfort|colin|phenyl|acid|bleach|scrub|ezee|safewash)\b/.test(nameVal)) {
        hsn = "3402";
        gst = "18";
      } else if (/\b(agarbatti|dhoop|incense|camphor|kapoor|pooja|havan|samagri|cotton wicks|mangaldeep|cycle agarbatti)\b/.test(nameVal)) {
        hsn = "3307";
        gst = "5";
      } else if (/\b(good knight|goodknight|hit|mortein|all out|allout|mosquito|repellent|coil|insecticide|pest|spray)\b/.test(nameVal)) {
        hsn = "3808";
        gst = "18";
      } else if (/\b(stayfree|stay free|whisper|sofy|sanitary|napkin|pad|pads)\b/.test(nameVal)) {
        hsn = "9619";
        gst = "0"; // Sanitary pads are tax-exempt (0% GST) in India
      } else if (/\b(diaper|diapers|pampers|huggies|mamypoko|mamy poko|baby wipe|baby wipes)\b/.test(nameVal)) {
        hsn = "9619";
        gst = "18";
      } else if (/\b(cola|coke|pepsi|sprite|fanta|thums up|thumsup|limca|dew|soda|aerated|soft drink|carbonated|maaza|frooti|slice|tropicana|real juice|real|juice|juices|drink|drinks|paper boat|b-natural|bnatural)\b/.test(nameVal)) {
        // Distinguish fruit juice (12%) from aerated carbonated beverages (28%)
        if (/\b(juice|juices|real|tropicana|maaza|frooti|slice|mango drink|paper boat|b-natural|bnatural)\b/.test(nameVal)) {
          hsn = "2202";
          gst = "12"; // Fruit pulp beverages / Juices
        } else {
          hsn = "2202";
          gst = "28"; // Sodas / Aerated soft drinks
        }
      } else if (/\b(water|mineral water|bisleri|kinley|aquafina|aquasure|himalayan)\b/.test(nameVal)) {
        hsn = "2201";
        gst = "18";
      } else if (/\b(sauce|ketchup|jam|mayonnaise|spread|kissans|kissan|shezwan|chutney|vinegar|soya sauce|chilli sauce)\b/.test(nameVal)) {
        hsn = "2103";
        gst = "18";
      } else if (/\b(pickle|pickles|achar|achari)\b/.test(nameVal)) {
        hsn = "2001";
        gst = "12";
      } else if (/\b(biscuit|cookie|cookies|marie|gold|parle|britannia|crackjack|monaco|oreo|hide seek|rusk|hide \& seek|unibic|sunfeast|moms magic)\b/.test(nameVal)) {
        hsn = "1905";
        gst = "18";
      } else if (/\b(chocolate|cadbury|dairy milk|kitkat|munch|perk|5 star|fivestar|snickers|choco|milkybar|eclairs|melody|cough drop|lozenge|candy|candies|gems)\b/.test(nameVal)) {
        hsn = "1806";
        gst = "18";
      } else if (/\b(noodle|noodles|maggi|yippee|pasta|macaroni|knorr|soup|vermicelli|chowmein|ramen)\b/.test(nameVal)) {
        hsn = "1902";
        gst = "18";
      } else if (/\b(chips|lays|kurkure|namkeen|bhujia|bingo|snack|puff|popcorn|mixture|sev|gathiya|murukku|aloo bhujia|chana chur)\b/.test(nameVal)) {
        hsn = "2106";
        gst = "12";
      } else if (/\b(ghee|butter|amul|mother dairy|paneer|cheese|cream)\b/.test(nameVal)) {
        hsn = "0405";
        gst = "12";
      } else if (/\b(mustard oil|fortune oil|refined oil|soya oil|canola oil|rice bran|safola|edible oil|coconut oil|dhara|saffola|oil|oils)\b/.test(nameVal)) {
        hsn = "1512";
        gst = "5";
      } else if (/\b(tea|coffee|nescafe|bru|red label|taj mahal|tata tea|taj|ctc|dust|filter coffee)\b/.test(nameVal)) {
        hsn = "0902";
        gst = "5";
      } else if (/\b(spice|masala|haldi|mirch|dhaniya|turmeric|chilli|mdh|everest|catch|powder|cardamom|elaichi|jeera|cumin|mustard seeds|sarso|methi|clove)\b/.test(nameVal)) {
        hsn = "0910";
        gst = "5";
      } else if (/\b(honey|dabur honey|patanjali honey)\b/.test(nameVal)) {
        hsn = "0409";
        gst = "5";
      } else if (/\b(papad|lijjat)\b/.test(nameVal)) {
        hsn = "1905";
        gst = "0";
      } else if (/\b(salt|tata salt)\b/.test(nameVal)) {
        hsn = "2501";
        gst = "0";
      } else if (/\b(atta|flour|maida|suji|besan|ashirvaad|aata|wheat flour)\b/.test(nameVal)) {
        hsn = "1101";
        gst = "5";
      } else if (/\b(rice|basmati|puls|dal|moong|chana|rajma|pulses|urad|arhar|masoor|toor|kabuli)\b/.test(nameVal)) {
        hsn = "1006";
        gst = "5";
      } else if (/\b(sugar|chini|shakkar|jaggery|gur)\b/.test(nameVal)) {
        hsn = "1701";
        gst = "5";
      }

      const hsnInput = document.getElementById("prod-hsn");
      const gstSelect = document.getElementById("prod-gst");
      
      // Auto-populate only if empty or previously auto-filled
      if (hsn && hsnInput && (!hsnInput.value || hsnInput.dataset.autoFilled === "true")) {
        hsnInput.value = hsn;
        hsnInput.dataset.autoFilled = "true";
      }
      if (gst && gstSelect && (gstSelect.value === "0" || gstSelect.dataset.autoFilled === "true")) {
        gstSelect.value = gst;
        gstSelect.dataset.autoFilled = "true";
      }
    });
  }

  document.getElementById("product-modal-close-btn").addEventListener("click", () => {
    addModal.classList.remove("active");
  });
  document.getElementById("prod-modal-cancel-btn").addEventListener("click", () => {
    addModal.classList.remove("active");
  });

  // Form submit handler
  document.getElementById("product-form").addEventListener("submit", (e) => {
    e.preventDefault();
    saveProductForm();
  });

  // Reset database utility
  document.getElementById("inv-reset-db-btn").addEventListener("click", () => {
    if (confirm("WARNING: This will delete all custom inventory changes and restore original factory mock catalog. Continue?")) {
      localStorage.removeItem("fc_products");
      localStorage.removeItem("fc_transactions");
      initData();
      renderAll();
    }
  });
}

function renderInventoryCategoriesFilter() {
  const select = document.getElementById("inv-filter-category");
  if (!select) return;

  const currentValue = select.value;
  select.innerHTML = `<option value="all">All Categories</option>`;
  
  const categories = [...new Set(state.products.map(p => p.category))];
  categories.forEach(cat => {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.innerText = cat;
    select.appendChild(opt);
  });

  select.value = currentValue;
}

function renderInventory() {
  const tableBody = document.getElementById("inventory-table-body");
  if (!tableBody) return;
  tableBody.innerHTML = "";

  const filtered = state.products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(invSearchQuery.toLowerCase()) ||
                          p.sku.includes(invSearchQuery) ||
                          (p.hsn && p.hsn.includes(invSearchQuery));
    const matchesCategory = invFilterCategory === "all" || p.category === invFilterCategory;
    
    let matchesStock = true;
    if (invFilterStock === 'low') {
      matchesStock = p.stock <= p.reorderLevel && p.stock > 0;
    } else if (invFilterStock === 'out') {
      matchesStock = p.stock <= 0;
    }

    return matchesSearch && matchesCategory && matchesStock;
  });

  if (filtered.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="10" style="text-align:center; color:var(--text-muted); padding:30px;">No inventory records match filters.</td></tr>`;
    return;
  }

  filtered.forEach(p => {
    const tr = document.createElement("tr");
    
    let badgeClass = "badge-success";
    let statusText = "In Stock";
    if (p.stock <= 0) {
      badgeClass = "badge-danger";
      statusText = "Out of Stock";
    } else if (p.stock <= p.reorderLevel) {
      badgeClass = "badge-warning";
      statusText = "Low Stock";
    }

    tr.innerHTML = `
      <td><span class="sku-text">${p.sku}</span></td>
      <td><span class="product-name-cell">${p.name}</span></td>
      <td>${p.category}</td>
      <td><span class="sku-text">${p.hsn || '-'}</span></td>
      <td>${formatRupee(p.costPrice)}</td>
      <td>${formatRupee(p.sellingPrice)}</td>
      <td>${p.gstSlab}%</td>
      <td>${p.discountPercent || 0}%</td>
      <td><strong>${p.stock} ${p.unit}</strong></td>
      <td><span class="badge ${badgeClass}">${statusText}</span></td>
      <td>
        <div class="action-buttons">
          <button class="btn-icon-only" onclick="editProduct('${p.sku}')" title="Edit Product">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          </button>
          <button class="btn-icon-only" onclick="deleteProduct('${p.sku}')" title="Delete Product">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
          </button>
        </div>
      </td>
    `;
    tableBody.appendChild(tr);
  });
}

async function saveProductForm() {
  const editSku = document.getElementById("prod-edit-id").value;
  let sku = document.getElementById("prod-sku").value.trim();
  const hsn = document.getElementById("prod-hsn").value.trim();
  const name = document.getElementById("prod-name").value.trim();
  const category = "General FMCG";
  const unit = document.getElementById("prod-unit").value;
  const costPrice = parseFloat(document.getElementById("prod-cost").value);
  const sellingPrice = parseFloat(document.getElementById("prod-price").value);
  const gstSlab = parseInt(document.getElementById("prod-gst").value);
  const stock = parseInt(document.getElementById("prod-stock").value);
  const reorderLevel = parseInt(document.getElementById("prod-reorder").value);
  const discountPercent = parseInt(document.getElementById("prod-discount").value) || 0;

  if (!sku) {
    sku = "LOCAL_" + Math.random().toString(36).substr(2, 8).toUpperCase();
  }

  const prodObj = {
    sku: editSku || sku,
    name, hsn, category, unit, costPrice, sellingPrice, gstSlab, stock, reorderLevel, discountPercent
  };

  try {
    await fetch('/api/save-product', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify(prodObj)
    });
  } catch(err) {
    console.error("Atomic save product error:", err);
  }

  await initData();
  document.getElementById("product-modal").classList.remove("active");
  renderAll();
}

// Global functions for inline table buttons
window.editProduct = function(sku) {
  const prod = state.products.find(p => p.sku === sku);
  if (!prod) return;

  document.getElementById("product-modal-title").innerText = "Edit Product Details";
  document.getElementById("prod-edit-id").value = prod.sku;
  
  // Fill inputs
  document.getElementById("prod-sku").value = prod.sku;
  document.getElementById("prod-sku").disabled = true; // prevent editing barcode SKU directly
  document.getElementById("prod-hsn").value = prod.hsn || "";
  document.getElementById("prod-name").value = prod.name;
  document.getElementById("prod-unit").value = prod.unit;
  document.getElementById("prod-cost").value = prod.costPrice;
  document.getElementById("prod-price").value = prod.sellingPrice;
  document.getElementById("prod-gst").value = prod.gstSlab;
  document.getElementById("prod-stock").value = prod.stock;
  document.getElementById("prod-reorder").value = prod.reorderLevel;
  document.getElementById("prod-discount").value = prod.discountPercent || 0;

  document.getElementById("product-modal").classList.add("active");
};

window.deleteProduct = async function(sku) {
  if (confirm(`Are you sure you want to delete product SKU: ${sku} from inventory?`)) {
    try {
      await fetch('/api/delete-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ sku })
      });
    } catch(err) {
      console.error("Atomic delete product error:", err);
    }
    await initData();
    renderAll();
  }
};

// ----------------------------------------------------
// VIEW 4: TRANSACTIONS HISTORICAL LEDGER
// ----------------------------------------------------
let txnSearchQuery = "";
let txnDateFilter = "";

function getLocalDateString(dateInput) {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function setupTransactionsLedger() {
  const searchInput = document.getElementById("txn-search-input");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      txnSearchQuery = e.target.value;
      renderTransactions();
    });
  }

  const dateInput = document.getElementById("txn-filter-date");
  if (dateInput) {
    dateInput.addEventListener("change", (e) => {
      txnDateFilter = e.target.value;
      renderTransactions();
    });
  }

  const clearDateBtn = document.getElementById("txn-clear-date-btn");
  if (clearDateBtn) {
    clearDateBtn.addEventListener("click", () => {
      if (dateInput) dateInput.value = "";
      txnDateFilter = "";
      renderTransactions();
    });
  }
}

function renderTransactions() {
  const tableBody = document.getElementById("txn-table-body");
  if (!tableBody) return;
  tableBody.innerHTML = "";

  const query = (txnSearchQuery || "").trim().toLowerCase();

  const filtered = state.transactions.filter(t => {
    const matchesSearch = !query ||
           (t.id && t.id.toLowerCase().includes(query)) ||
           (t.customerName && t.customerName.toLowerCase().includes(query)) ||
           (t.customerPhone && t.customerPhone.includes(query));

    let matchesDate = true;
    if (txnDateFilter) {
      const txnDateStr = getLocalDateString(t.date);
      matchesDate = (txnDateStr === txnDateFilter);
    }

    return matchesSearch && matchesDate;
  });

  // Sort descending by date
  const sorted = [...filtered].sort((a, b) => new Date(b.date) - new Date(a.date));

  if (sorted.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="10" style="text-align:center; color:var(--text-muted); padding:30px;">No transactions recorded matching the selected filters.</td></tr>`;
    return;
  }

  sorted.forEach(t => {
    const tr = document.createElement("tr");
    
    // Count total items
    const itemCount = Array.isArray(t.items) ? t.items.reduce((acc, curr) => acc + (curr.quantity || 0), 0) : 0;

    tr.innerHTML = `
      <td>${formatDate(t.date)}</td>
      <td><strong>${t.id}</strong></td>
      <td>
        <div>${t.customerName || 'Walk-in Customer'}</div>
        <div style="font-size:11px; color:var(--text-muted);">${t.customerPhone || 'N/A'}</div>
      </td>
      <td>${itemCount} items</td>
      <td>${formatRupee(t.subtotal)}</td>
      <td>${formatRupee(t.discountAmount)}</td>
      <td>${formatRupee(t.gstAmount)}</td>
      <td><strong style="color:var(--primary);">${formatRupee(t.totalPayable)}</strong></td>
      <td><span class="badge badge-info">${t.paymentMethod}</span></td>
      <td>
        <button class="btn btn-secondary" style="padding:4px 10px; font-size:12px;" onclick="viewPastInvoice('${t.id}')">View Invoice</button>
      </td>
    `;
    tableBody.appendChild(tr);
  });
}

window.viewPastInvoice = function(txnId) {
  const txn = state.transactions.find(t => t.id === txnId);
  if (!txn) return;

  buildReceiptInvoice(txn);
  document.getElementById("receipt-invoice-id").innerText = `Invoice No: ${txnId}`;
  document.getElementById("receipt-modal").classList.add("active");
};

// ----------------------------------------------------
// CSV CATALOG BULK IMPORT & EXPORT ENGINE
// ----------------------------------------------------
function setupCSVImportExport() {
  const importModal = document.getElementById("csv-import-modal");
  const fileInput = document.getElementById("csv-file-input");
  const dropZone = document.getElementById("csv-drop-zone");
  const importSubmitBtn = document.getElementById("csv-modal-submit-btn");
  const fileInfo = document.getElementById("csv-file-info");

  // Show Modal trigger
  document.getElementById("inv-import-modal-btn").addEventListener("click", () => {
    fileInfo.style.display = "none";
    fileInput.value = "";
    importSubmitBtn.disabled = true;
    importModal.classList.add("active");
  });

  // Modal Cancel Close
  document.getElementById("csv-modal-close-btn").addEventListener("click", () => importModal.classList.remove("active"));
  document.getElementById("csv-modal-cancel-btn").addEventListener("click", () => importModal.classList.remove("active"));

  // Download template CSV file
  document.getElementById("csv-download-template-btn").addEventListener("click", () => {
    const csvContent = "data:text/csv;charset=utf-8," 
      + "SKU_Barcode,Product_Name,Category,HSN,Cost_Price,Selling_Price,GST_Slab_Percent,Discount_Percent,Stock_Quantity,Reorder_Limit,Unit\n"
      + "8901030753007,Amul Butter 500g,Dairy,0405,240,275,12,0,50,10,pcs\n"
      + "8901499009132,Tata Salt 1kg,Pantry,2501,22,28,0,0,100,15,pcs\n"
      + "1001,Fresh Onion,Produce,0703,26,35,0,0,150,20,kg";

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "gulati_store_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });

  // CSV Drag/Drop events
  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.style.borderColor = "var(--primary)";
  });

  dropZone.addEventListener("dragleave", () => {
    dropZone.style.borderColor = "var(--border-color)";
  });

  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.style.borderColor = "var(--border-color)";
    if (e.dataTransfer.files.length > 0) {
      fileInput.files = e.dataTransfer.files;
      handleFileSelected();
    }
  });

  fileInput.addEventListener("change", handleFileSelected);

  function handleFileSelected() {
    const file = fileInput.files[0];
    if (file && file.name.endsWith(".csv")) {
      fileInfo.style.display = "block";
      fileInfo.innerText = `Selected File: ${file.name} (${(file.size / 1024).toFixed(2)} KB)`;
      importSubmitBtn.disabled = false;
    } else {
      alert("Invalid format. Please upload a .csv file.");
      fileInput.value = "";
      importSubmitBtn.disabled = true;
      fileInfo.style.display = "none";
    }
  }

  // Parse CSV and merge/load into local state
  importSubmitBtn.addEventListener("click", () => {
    const file = fileInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
      const text = e.target.result;
      processCSVText(text);
    };
    reader.readAsText(file);
  });

  // Export current catalog as CSV file
  document.getElementById("inv-export-csv-btn").addEventListener("click", () => {
    let csvString = "SKU_Barcode,Product_Name,Category,HSN,Cost_Price,Selling_Price,GST_Slab_Percent,Discount_Percent,Stock_Quantity,Reorder_Limit,Unit\n";
    
    state.products.forEach(p => {
      csvString += `"${p.sku}","${p.name.replace(/"/g, '""')}","${p.category}","${p.hsn || ''}",${p.costPrice},${p.sellingPrice},${p.gstSlab},${p.discountPercent || 0},${p.stock},${p.reorderLevel},"${p.unit}"\n`;
    });

    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `gulati_store_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });
}

function processCSVText(text) {
  const lines = text.split(/\r?\n/);
  if (lines.length <= 1) {
    alert("Empty CSV file.");
    return;
  }

  // Header indices matching
  // SKU_Barcode,Product_Name,Category,HSN,Cost_Price,Selling_Price,GST_Slab_Percent,Stock_Quantity,Reorder_Limit,Unit
  const headers = lines[0].split(",");
  
  let importCount = 0;
  let errorCount = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // skip empty rows

    // regex split to correctly handle comma inside quotes
    const fields = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
    
    if (fields.length < 6) {
      errorCount++;
      continue;
    }

    // Clean quotes
    const clean = str => str ? str.replace(/^["']|["']$/g, '').trim() : '';

    const sku = clean(fields[0]);
    const name = clean(fields[1]);
    const category = clean(fields[2]) || "Pantry";
    const hsn = clean(fields[3]) || "";
    const costPrice = parseFloat(clean(fields[4])) || 0;
    const sellingPrice = parseFloat(clean(fields[5])) || 0;
    const gstSlab = parseInt(clean(fields[6])) || 0;
    const discountPercent = parseInt(clean(fields[7])) || 0;
    const stock = parseInt(clean(fields[8])) || 0;
    const reorderLevel = parseInt(clean(fields[9])) || 5;
    const unit = clean(fields[10]) || "pcs";

    if (!sku || !name) {
      errorCount++;
      continue;
    }

    // Update product if SKU matches, otherwise append
    const existingIndex = state.products.findIndex(p => p.sku === sku);
    const newProd = { sku, name, category, hsn, costPrice, sellingPrice, gstSlab, discountPercent, stock, reorderLevel, unit };

    if (existingIndex !== -1) {
      state.products[existingIndex] = newProd;
    } else {
      state.products.push(newProd);
    }
    importCount++;
  }

  saveProductsToStorage();
  document.getElementById("csv-import-modal").classList.remove("active");
  renderAll();

  alert(`Bulk Import Finished!\nSuccessfully imported/updated: ${importCount} products.\nFailed: ${errorCount} rows.`);
}

// ----------------------------------------------------
// VIEW 5: CUSTOMER LEDGER (KHATA BOOK)
// ----------------------------------------------------
let ledgerSearchQuery = "";

function renderLedger() {
  const tableBody = document.getElementById("ledger-table-body");
  if (!tableBody) return;
  tableBody.innerHTML = "";

  // Calculate aggregate stats
  const totalOutstanding = state.customers.reduce((acc, curr) => acc + curr.balance, 0);
  const activeDebtors = state.customers.filter(c => c.balance > 0).length;

  document.getElementById("stat-total-dues").innerText = formatRupee(totalOutstanding);
  document.getElementById("stat-active-debtors").innerText = activeDebtors;

  // Filter list
  const filtered = state.customers.filter(c => {
    return c.name.toLowerCase().includes(ledgerSearchQuery.toLowerCase()) ||
           c.phone.includes(ledgerSearchQuery);
  });

  if (filtered.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:30px;">No customer ledger accounts found.</td></tr>`;
    return;
  }

  // Sort by balance outstanding descending
  const sorted = [...filtered].sort((a, b) => b.balance - a.balance);

    sorted.forEach(cust => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><strong>${cust.name}</strong></td>
        <td><span class="sku-text">${cust.phone}</span></td>
        <td>${formatRupee(cust.totalPurchased)}</td>
        <td style="font-weight:700; color:${cust.balance > 0 ? 'var(--danger)' : 'var(--success)'};">${formatRupee(cust.balance)}</td>
        <td>${cust.lastTxn ? cust.lastTxn : '-'}</td>
        <td>
          <div class="action-buttons">
            <button class="btn btn-secondary" style="padding:4px 10px; font-size:12px;" onclick="viewLedgerStatement('${cust.phone}')">Statement</button>
            <button class="btn btn-primary" style="padding:4px 10px; font-size:12px; background-color:var(--success); border-color:var(--success);" onclick="openPayDuesModal('${cust.phone}')">Record Payment</button>
            <button class="btn btn-primary" style="padding:4px 10px; font-size:12px; background-color:var(--danger); border-color:var(--danger);" onclick="openAdjustDuesModal('${cust.phone}')">Adjust Dues</button>
          </div>
        </td>
      `;
      tableBody.appendChild(tr);
    });
}

// Hook up search filter
document.getElementById("ledger-search-input").addEventListener("input", (e) => {
  ledgerSearchQuery = e.target.value;
  renderLedger();
});

// Ledger Statement modal functions
// Ledger Statement modal functions
window.viewLedgerStatement = function(phone) {
  const cust = state.customers.find(c => c.phone === phone);
  if (!cust) return;

  state.activeStatementPhone = phone;

  document.getElementById("statement-title").innerText = `${cust.name} - Ledger Statement`;
  document.getElementById("statement-subtitle").innerText = `Phone: ${cust.phone} | Outstanding Dues: ${formatRupee(cust.balance)}`;

  // Reset filters to default
  const periodSelector = document.getElementById("statement-period");
  const customDates = document.getElementById("statement-custom-dates");
  if (periodSelector) periodSelector.value = "all";
  if (customDates) customDates.style.display = "none";

  filterAndRenderStatement();

  document.getElementById("ledger-statement-modal").classList.add("active");
};

function filterAndRenderStatement() {
  const phone = state.activeStatementPhone;
  const cust = state.customers.find(c => c.phone === phone);
  if (!cust) return;

  const period = document.getElementById("statement-period").value;
  let start = null;
  let end = null;

  if (period === '30days') {
    start = new Date();
    start.setDate(start.getDate() - 30);
    start.setHours(0, 0, 0, 0);
    end = new Date();
    end.setHours(23, 59, 59, 999);
  } else if (period === 'current-month') {
    start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    end = new Date();
    end.setHours(23, 59, 59, 999);
  } else if (period === 'year') {
    start = new Date();
    start.setFullYear(start.getFullYear() - 1);
    start.setHours(0, 0, 0, 0);
    end = new Date();
    end.setHours(23, 59, 59, 999);
  } else if (period === 'custom') {
    const startVal = document.getElementById("statement-start-date").value;
    const endVal = document.getElementById("statement-end-date").value;
    if (startVal) start = new Date(startVal + "T00:00:00");
    if (endVal) end = new Date(endVal + "T23:59:59");
  }

  // Get and sort all customer entries
  const allCustEntries = state.ledgerEntries.filter(e => e.phone === phone)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const renderedEntries = [];
  let broughtForwardBalance = 0;
  let runningBalance = 0;

  allCustEntries.forEach(entry => {
    const entryDate = new Date(entry.date);
    const isBeforeStart = start && entryDate < start;
    const isAfterEnd = end && entryDate > end;

    if (entry.type === 'debit') {
      runningBalance += entry.amount;
    } else {
      runningBalance -= entry.amount;
    }

    if (isBeforeStart) {
      broughtForwardBalance = runningBalance;
    } else if (!isAfterEnd) {
      renderedEntries.push({
        ...entry,
        runningBalAfter: runningBalance
      });
    }
  });

  const statementBody = document.getElementById("statement-table-body");
  statementBody.innerHTML = "";

  // Render brought forward balance if date filter is active and balance !== 0
  if (start && broughtForwardBalance !== 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${start.toLocaleDateString('en-IN')}</td>
      <td><strong>Balance Brought Forward (BF)</strong></td>
      <td style="color:var(--danger);">${broughtForwardBalance > 0 ? '+' + formatRupee(broughtForwardBalance) : '-'}</td>
      <td style="color:var(--success);">${broughtForwardBalance < 0 ? '-' + formatRupee(Math.abs(broughtForwardBalance)) : '-'}</td>
      <td style="font-weight:700; color:${broughtForwardBalance > 0 ? 'var(--danger)' : 'var(--success)'};">${formatRupee(broughtForwardBalance)}</td>
    `;
    statementBody.appendChild(tr);
  }

  if (renderedEntries.length === 0 && broughtForwardBalance === 0) {
    statementBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:20px;">No transaction entries found for this period.</td></tr>`;
  } else {
    renderedEntries.forEach(entry => {
      const tr = document.createElement("tr");
      const isInvoice = entry.ref.startsWith("TXN-");
      const isStdPayment = ["Cash", "UPI", "Card", "Wallet"].includes(entry.ref);
      let detailsText = "";
      
      if (entry.ref === "Opening Balance") {
        detailsText = "Opening Balance / Previous Dues";
      } else if (!isInvoice && !isStdPayment) {
        detailsText = entry.type === 'debit' 
          ? `Balance Increase (Ref: ${entry.ref})` 
          : `Balance Decrease (Ref: ${entry.ref})`;
      } else {
        detailsText = entry.type === 'debit' 
          ? `Credit Purchase (Ref: ${entry.ref})` 
          : `Payment Received (${entry.ref})`;
      }
      
      let attachmentLink = "";
      if (entry.attachmentData) {
        attachmentLink = `<br><a href="${entry.attachmentData}" download="${entry.attachmentName || 'proof.png'}" style="color:var(--primary); font-size:11px; font-weight:600; text-decoration:underline; display:inline-block; margin-top:4px;">📎 View Proof Attachment</a>`;
      }
      
      tr.innerHTML = `
        <td>${formatDate(entry.date)}</td>
        <td><strong>${detailsText}</strong>${attachmentLink}</td>
        <td style="color:var(--danger);">${entry.type === 'debit' ? '+' + formatRupee(entry.amount) : '-'}</td>
        <td style="color:var(--success);">${entry.type === 'credit' ? '-' + formatRupee(entry.amount) : '-'}</td>
        <td style="font-weight:700; color:${entry.runningBalAfter > 0 ? 'var(--danger)' : 'var(--success)'};">${formatRupee(entry.runningBalAfter)}</td>
      `;
      statementBody.appendChild(tr);
    });
  }

  // Print button listener (respects period range and BF calculations)
  document.getElementById("statement-print-btn").onclick = function() {
    const receiptArea = document.getElementById("receipt-print-area");
    if (!receiptArea) return;

    let rows = "";
    
    // BF Row print
    if (start && broughtForwardBalance !== 0) {
      rows += `
        <tr>
          <td style="font-size:11px;">${start.toLocaleDateString('en-IN')}</td>
          <td style="font-size:11px;">BAL BROUGHT FORWARD (BF)</td>
          <td style="font-size:11px; text-align:right;">${broughtForwardBalance > 0 ? '₹' + broughtForwardBalance.toFixed(2) : '-'}</td>
          <td style="font-size:11px; text-align:right;">${broughtForwardBalance < 0 ? '₹' + Math.abs(broughtForwardBalance).toFixed(2) : '-'}</td>
          <td style="font-size:11px; text-align:right; font-weight:700;">${broughtForwardBalance < 0 ? '-' : ''}₹${Math.abs(broughtForwardBalance).toFixed(2)}</td>
        </tr>
      `;
    }

    renderedEntries.forEach(e => {
      const isInv = e.ref.startsWith("TXN-");
      const isPay = ["Cash", "UPI", "Card", "Wallet"].includes(e.ref);
      let printDetails = "";
      
      if (e.ref === 'Opening Balance') {
        printDetails = 'OPENING BALANCE';
      } else if (!isInv && !isPay) {
        printDetails = e.type === 'debit' 
          ? `BAL INCREASE (${e.ref.toUpperCase()})` 
          : `BAL DECREASE (${e.ref.toUpperCase()})`;
      } else {
        printDetails = e.type === 'debit' 
          ? `PURCHASE (${e.ref})` 
          : `PAYMENT (${e.ref})`;
      }
      
      rows += `
        <tr>
          <td style="font-size:11px;">${new Date(e.date).toLocaleDateString('en-IN')}</td>
          <td style="font-size:11px;">${printDetails}</td>
          <td style="font-size:11px; text-align:right;">${e.type === 'debit' ? '₹' + e.amount.toFixed(2) : '-'}</td>
          <td style="font-size:11px; text-align:right;">${e.type === 'credit' ? '₹' + e.amount.toFixed(2) : '-'}</td>
          <td style="font-size:11px; text-align:right; font-weight:700;">${e.runningBalAfter < 0 ? '-' : ''}₹${Math.abs(e.runningBalAfter).toFixed(2)}</td>
        </tr>
      `;
    });

    // Subtitle text to reflect period limit
    let periodText = "ALL TIME STATEMENT";
    if (start && end) {
      periodText = `PERIOD: ${start.toLocaleDateString('en-IN')} TO ${end.toLocaleDateString('en-IN')}`;
    } else if (start) {
      periodText = `SINCE ${start.toLocaleDateString('en-IN')}`;
    }

    receiptArea.innerHTML = `
      <div class="receipt-header">
        <div class="receipt-store-title">GULATI STORE</div>
        <div style="font-size:11px; color:#4B5563;">${periodText}</div>
        <div style="font-size:12px; font-weight:700; margin-top:6px;">${cust.name.toUpperCase()}</div>
        <div style="font-size:11px; color:#4B5563;">Mobile: ${cust.phone}</div>
      </div>
      <table class="receipt-table" style="font-size:11px;">
        <thead>
          <tr>
            <th style="text-align:left;">Date</th>
            <th style="text-align:left;">Details</th>
            <th style="text-align:right;">Debit (+)</th>
            <th style="text-align:right;">Credit (-)</th>
            <th style="text-align:right;">Bal Due</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
      <div class="receipt-summary" style="border-top:1px solid #111827; padding-top:8px;">
        <div class="receipt-row bold">
          <span>NET OUTSTANDING BALANCE:</span>
          <span>${cust.balance < 0 ? '-' : ''}₹${Math.abs(cust.balance).toFixed(2)}</span>
        </div>
      </div>
      <div class="receipt-footer" style="margin-top:16px;">
        <p>Generated on ${new Date().toLocaleDateString('en-IN')}</p>
        <p>Gulati Store Khata System</p>
      </div>
    `;

    window.print();
  };

  // Download Statement button listener
  document.getElementById("statement-download-btn").onclick = function() {
    if (typeof window.jspdf === "undefined" || typeof window.jspdf.jsPDF === "undefined") {
      alert("PDF generation library is loading or unavailable. Please check your internet connection.");
      return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4"
    });

    let periodText = "ALL TIME STATEMENT";
    if (start && end) {
      periodText = `PERIOD: ${start.toLocaleDateString('en-IN')} TO ${end.toLocaleDateString('en-IN')}`;
    } else if (start) {
      periodText = `SINCE ${start.toLocaleDateString('en-IN')}`;
    }

    const cleanName = cust.name.replace(/\s+/g, '_');
    const todayStr = new Date().toISOString().split('T')[0];

    // Styling configurations
    doc.setFont("helvetica", "normal");
    
    // Header
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(17, 24, 39); // Dark Gray
    doc.text("GULATI STORE", 14, 20);
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(75, 85, 99); // Medium Gray
    doc.text("Customer Ledger Statement", 14, 26);
    doc.text(periodText, 14, 32);
    
    // Divider
    doc.setDrawColor(209, 213, 219); // border-color
    doc.line(14, 36, 196, 36);
    
    // Customer Info
    doc.setFontSize(11);
    doc.setTextColor(17, 24, 39);
    doc.setFont("helvetica", "bold");
    doc.text(`Customer: ${cust.name.toUpperCase()}`, 14, 45);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(75, 85, 99);
    doc.text(`Mobile: ${cust.phone}`, 14, 51);
    doc.text(`Date Generated: ${new Date().toLocaleDateString('en-IN')}`, 14, 57);
    
    // Table Headers
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(17, 24, 39);
    doc.setFillColor(243, 244, 246); // gray-100 background
    doc.rect(14, 65, 182, 8, "F");
    doc.text("Date", 16, 70);
    doc.text("Details", 40, 70);
    doc.text("Debit (+)", 115, 70, { align: "right" });
    doc.text("Credit (-)", 150, 70, { align: "right" });
    doc.text("Balance Due", 192, 70, { align: "right" });
    
    // Draw table rows
    let y = 80;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(55, 65, 81); // gray-700
    
    // BF Row print
    if (start && broughtForwardBalance !== 0) {
      doc.text(start.toLocaleDateString('en-IN'), 16, y);
      doc.setFont("helvetica", "bold");
      doc.text("BAL BROUGHT FORWARD (BF)", 40, y);
      doc.setFont("helvetica", "normal");
      doc.text(broughtForwardBalance > 0 ? `₹${broughtForwardBalance.toFixed(2)}` : "-", 115, y, { align: "right" });
      doc.text(broughtForwardBalance < 0 ? `₹${Math.abs(broughtForwardBalance).toFixed(2)}` : "-", 150, y, { align: "right" });
      doc.text(`₹${broughtForwardBalance.toFixed(2)}`, 192, y, { align: "right" });
      y += 8;
    }

    renderedEntries.forEach(e => {
      // Check page overflow
      if (y > 270) {
        doc.addPage();
        y = 25;
        // repeat headers on new page
        doc.setFont("helvetica", "bold");
        doc.setTextColor(17, 24, 39);
        doc.setFillColor(243, 244, 246);
        doc.rect(14, y - 5, 182, 8, "F");
        doc.text("Date", 16, y);
        doc.text("Details", 40, y);
        doc.text("Debit (+)", 115, y, { align: "right" });
        doc.text("Credit (-)", 150, y, { align: "right" });
        doc.text("Balance Due", 192, y, { align: "right" });
        doc.setFont("helvetica", "normal");
        doc.setTextColor(55, 65, 81);
        y += 10;
      }

      const isInv = e.ref.startsWith("TXN-");
      const isPay = ["Cash", "UPI", "Card", "Wallet"].includes(e.ref);
      let printDetails = "";
      
      if (e.ref === 'Opening Balance') {
        printDetails = 'Opening Balance';
      } else if (!isInv && !isPay) {
        printDetails = e.type === 'debit' 
          ? `Bal Increase (${e.ref})` 
          : `Bal Decrease (${e.ref})`;
      } else {
        printDetails = e.type === 'debit' 
          ? `Purchase (${e.ref})` 
          : `Payment (${e.ref})`;
      }

      // Truncate details if too long to prevent row overlap
      if (printDetails.length > 32) {
        printDetails = printDetails.substring(0, 29) + "...";
      }

      doc.text(new Date(e.date).toLocaleDateString('en-IN'), 16, y);
      doc.text(printDetails, 40, y);
      doc.text(e.type === 'debit' ? `₹${e.amount.toFixed(2)}` : "-", 115, y, { align: "right" });
      doc.text(e.type === 'credit' ? `₹${e.amount.toFixed(2)}` : "-", 150, y, { align: "right" });
      doc.text(`${e.runningBalAfter < 0 ? '-' : ''}₹${Math.abs(e.runningBalAfter).toFixed(2)}`, 192, y, { align: "right" });
      y += 8;
    });

    // Divider
    doc.setDrawColor(17, 24, 39);
    doc.line(14, y, 196, y);
    y += 8;
    
    // Net balance
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(17, 24, 39);
    doc.text("NET OUTSTANDING BALANCE:", 14, y);
    doc.text(`${cust.balance < 0 ? '-' : ''}₹${Math.abs(cust.balance).toFixed(2)}`, 192, y, { align: "right" });
    
    // Footer
    y += 12;
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(156, 163, 175); // gray-400
    doc.text("Thank you for choosing Gulati Store Khata System.", 14, y);
    
    // Save PDF file locally
    doc.save(`Statement_${cleanName}_${todayStr}.pdf`);
  };
}

// Hook up Close Statement modal actions
document.getElementById("statement-modal-close-btn").addEventListener("click", () => {
  document.getElementById("ledger-statement-modal").classList.remove("active");
});
document.getElementById("statement-modal-close-btn-bottom").addEventListener("click", () => {
  document.getElementById("ledger-statement-modal").classList.remove("active");
});

// Record Payments modal functions
window.openPayDuesModal = function(phone) {
  const cust = state.customers.find(c => c.phone === phone);
  if (!cust) return;

  document.getElementById("payment-cust-phone").value = cust.phone;
  document.getElementById("payment-cust-name").value = cust.name;
  document.getElementById("payment-current-balance").value = formatRupee(cust.balance);
  document.getElementById("payment-amount").value = "";

  document.getElementById("payment-modal").classList.add("active");
};

// Modal Cancel/Close click
document.getElementById("payment-modal-close-btn").addEventListener("click", () => {
  document.getElementById("payment-modal").classList.remove("active");
});
document.getElementById("payment-modal-cancel-btn").addEventListener("click", () => {
  document.getElementById("payment-modal").classList.remove("active");
});

// Log payment submit handler
document.getElementById("ledger-payment-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  const phone = document.getElementById("payment-cust-phone").value;
  const amountPaid = parseFloat(document.getElementById("payment-amount").value);
  const method = document.getElementById("payment-method").value;

  if (isNaN(amountPaid) || amountPaid <= 0) {
    alert("Please enter a valid payment amount.");
    return;
  }

  try {
    await fetch('/api/record-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({
        phone: String(phone),
        amountPaid: amountPaid,
        paymentMethod: method
      })
    });
  } catch(err) {
    console.error("Atomic record payment error:", err);
  }

  // Refresh server state across devices
  await initData();

  document.getElementById("payment-modal").classList.remove("active");
  renderLedger();
});

function updatePOSCustomerDatalists() {
  const namesList = document.getElementById("pos-customer-names-list");
  const phonesList = document.getElementById("pos-customer-phones-list");
  if (!namesList || !phonesList) return;

  namesList.innerHTML = "";
  phonesList.innerHTML = "";

  state.customers.forEach(cust => {
    const nameOpt = document.createElement("option");
    nameOpt.value = cust.name;
    namesList.appendChild(nameOpt);

    const phoneOpt = document.createElement("option");
    phoneOpt.value = cust.phone;
    phonesList.appendChild(phoneOpt);
  });
}

function setupCustomerLedgerActions() {
  const addModal = document.getElementById("add-customer-modal");
  const addBtn = document.getElementById("ledger-add-customer-btn");
  const closeBtn = document.getElementById("add-cust-modal-close-btn");
  const cancelBtn = document.getElementById("add-cust-modal-cancel-btn");
  const form = document.getElementById("add-customer-form");

  if (addBtn) {
    addBtn.addEventListener("click", () => {
      form.reset();
      addModal.classList.add("active");
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", () => addModal.classList.remove("active"));
  }
  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => addModal.classList.remove("active"));
  }

  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      
      const name = document.getElementById("cust-new-name").value.trim();
      const phone = document.getElementById("cust-new-phone").value.trim();
      const dues = parseFloat(document.getElementById("cust-new-dues").value) || 0;

      if (!name || !phone || !/^\d{10}$/.test(phone)) {
        alert("Please enter a valid Customer Name and 10-digit Indian Mobile Number.");
        return;
      }

      // Check duplication
      const existing = state.customers.find(c => c.phone === phone);
      if (existing) {
        alert(`A customer account with phone number ${phone} already exists (Name: ${existing.name}).`);
        return;
      }

      // Create new customer
      const newCust = {
        name: name,
        phone: phone,
        totalPurchased: dues > 0 ? dues : 0,
        balance: dues,
        lastTxn: dues !== 0 ? new Date().toISOString().split('T')[0] : ""
      };

      state.customers.push(newCust);
      saveCustomersToStorage();

      // If opening dues !== 0, log an opening balance entry
      if (dues !== 0) {
        state.ledgerEntries.push({
          date: new Date().toISOString(),
          phone: phone,
          type: dues > 0 ? "debit" : "credit",
          amount: Math.abs(dues),
          ref: "Opening Balance"
        });
        saveLedgerToStorage();
      }

      addModal.classList.remove("active");
      renderLedger();
      updatePOSCustomerDatalists(); // keep POS dropdowns updated
    });
  }

  // Adjust Dues Modal Close/Cancel
  const adjustModal = document.getElementById("adjust-dues-modal");
  const adjustCloseBtn = document.getElementById("adjust-dues-modal-close-btn");
  const adjustCancelBtn = document.getElementById("adjust-dues-modal-cancel-btn");
  const adjustForm = document.getElementById("adjust-dues-form");

  if (adjustCloseBtn) {
    adjustCloseBtn.addEventListener("click", () => adjustModal.classList.remove("active"));
  }
  if (adjustCancelBtn) {
    adjustCancelBtn.addEventListener("click", () => adjustModal.classList.remove("active"));
  }

  const cameraBtn = document.getElementById("adjust-camera-btn");
  const cameraInput = document.getElementById("adjust-camera-attachment");

  if (cameraBtn && cameraInput) {
    cameraBtn.addEventListener("click", () => {
      cameraInput.click();
    });
  }

  if (adjustForm) {
    adjustForm.addEventListener("submit", (e) => {
      e.preventDefault();

      try {
        const phone = document.getElementById("adjust-cust-phone").value;
        const addedDuesVal = document.getElementById("adjust-new-dues").value;
        const addedDues = parseFloat(addedDuesVal);
        const reason = document.getElementById("adjust-reason").value.trim() || "Balance Adjustment";
        const attachmentInput = document.getElementById("adjust-attachment");
        
        let file = null;
        if (attachmentInput && attachmentInput.files && attachmentInput.files[0]) {
          file = attachmentInput.files[0];
        } else if (cameraInput && cameraInput.files && cameraInput.files[0]) {
          file = cameraInput.files[0];
        }

        if (isNaN(addedDues) || addedDues === 0) {
          alert("Please enter a valid dues adjustment amount (e.g. 500 to add, -200 to subtract).");
          return;
        }

        const cust = state.customers.find(c => String(c.phone).trim() === String(phone).trim());
        if (!cust) {
          alert("Customer account could not be found for phone: " + phone);
          return;
        }

        const saveAdjustment = async (attachmentData = null, attachmentName = null) => {
          try {
            await fetch('/api/adjust-dues', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
              body: JSON.stringify({
                phone: String(phone),
                addedDues: addedDues,
                reason: reason,
                attachmentData: attachmentData,
                attachmentName: attachmentName
              })
            });
          } catch(err) {
            console.error("Atomic adjust dues error:", err);
          }

          // Fetch latest server data to merge instantly across devices
          await initData();

          const modalEl = document.getElementById("adjust-dues-modal");
          if (modalEl) modalEl.classList.remove("active");
          renderLedger();
        };

        if (file) {
          if (file.size > 5 * 1024 * 1024) {
            alert("File size exceeds 5MB limit. Please upload a smaller file.");
            return;
          }

          const reader = new FileReader();
          reader.onload = function(evt) {
            saveAdjustment(evt.target.result, file.name || "camera_photo.jpg");
          };
          reader.onerror = function() {
            alert("Error reading attachment file. Saving adjustment without attachment.");
            saveAdjustment();
          };
          reader.readAsDataURL(file);
        } else {
          saveAdjustment();
        }
      } catch (err) {
        console.error("Error processing adjustment:", err);
        alert("An error occurred while saving the adjustment: " + err.message);
      }
    });
  }

  // Statement filters change listeners
  const periodSelector = document.getElementById("statement-period");
  const customDates = document.getElementById("statement-custom-dates");
  const startDateInput = document.getElementById("statement-start-date");
  const endDateInput = document.getElementById("statement-end-date");

  if (periodSelector) {
    periodSelector.addEventListener("change", (e) => {
      if (e.target.value === 'custom') {
        customDates.style.display = "flex";
        // Seed default custom dates (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        startDateInput.value = thirtyDaysAgo.toISOString().split('T')[0];
        endDateInput.value = new Date().toISOString().split('T')[0];
      } else {
        customDates.style.display = "none";
      }
      filterAndRenderStatement();
    });
  }

  if (startDateInput) {
    startDateInput.addEventListener("input", filterAndRenderStatement);
  }
  if (endDateInput) {
    endDateInput.addEventListener("input", filterAndRenderStatement);
  }
}

window.openAdjustDuesModal = function(phone) {
  const cust = state.customers.find(c => c.phone === phone);
  if (!cust) return;

  document.getElementById("adjust-cust-phone").value = cust.phone;
  document.getElementById("adjust-cust-name").value = cust.name;
  document.getElementById("adjust-current-dues").value = formatRupee(cust.balance);
  document.getElementById("adjust-new-dues").value = "";
  document.getElementById("adjust-reason").value = "";
  
  const fileInput = document.getElementById("adjust-attachment");
  if (fileInput) fileInput.value = "";

  const cameraInput = document.getElementById("adjust-camera-attachment");
  if (cameraInput) cameraInput.value = "";

  document.getElementById("adjust-dues-modal").classList.add("active");
};

// =======================================================
// SECURITY PIN ENTRY & AUTHENTICATION HANDLERS
// =======================================================
function getAuthHeaders() {
  const token = localStorage.getItem('fc_session_token');
  return token ? { 'Authorization': 'Bearer ' + token } : {};
}

function showLoginScreen() {
  const overlay = document.getElementById('login-overlay');
  if (overlay) {
    overlay.classList.add('login-overlay-active');
  }
}

function hideLoginScreen() {
  const overlay = document.getElementById('login-overlay');
  if (overlay) {
    overlay.classList.remove('login-overlay-active');
  }
}

// Keyboard listener for PIN entry
document.addEventListener("keydown", (e) => {
  const overlay = document.getElementById('login-overlay');
  if (!overlay || !overlay.classList.contains('login-overlay-active')) {
    return;
  }
  
  if (e.key >= '0' && e.key <= '9') {
    pressPinNumber(e.key);
  } else if (e.key === 'Backspace') {
    backspacePin();
  } else if (e.key === 'Escape' || e.key === 'c' || e.key === 'C') {
    clearPin();
  }
});

// =======================================================
// CHANGE PIN MODAL AND ACTION HANDLERS
// =======================================================

window.openChangePinModal = function() {
  // Auto-collapse mobile menu when Change PIN is opened
  const sidebar = document.getElementById("sidebar");
  if (sidebar) sidebar.classList.remove("menu-open");

  const modal = document.getElementById("change-pin-modal");
  if (!modal) return;
  
  // Reset form inputs & messages
  document.getElementById("pin-current").value = "";
  document.getElementById("pin-new").value = "";
  document.getElementById("pin-confirm").value = "";
  document.getElementById("pin-otp").value = "";

  // Populate printer inputs and reset statuses
  document.getElementById("settings-printer-name").value = state.settings.printer_name || "Default";
  document.getElementById("settings-auto-print").checked = state.settings.auto_print === "true";
  document.getElementById("settings-gstin").value = state.settings.gstin || "07AAAAA1111A1Z1";
  document.getElementById("printer-settings-status").style.display = "none";
  
  // Hide OTP container and Reset buttons to Step 1
  document.getElementById("pin-otp-container").style.display = "none";
  document.getElementById("pin-otp").required = false;
  document.getElementById("change-pin-request-btn").style.display = "block";
  document.getElementById("change-pin-submit-btn").style.display = "none";
  
  document.getElementById("change-pin-error").style.display = "none";
  document.getElementById("change-pin-success").style.display = "none";
  
  modal.classList.add("active");
};

function closeChangePinModal() {
  const modal = document.getElementById("change-pin-modal");
  if (modal) {
    modal.classList.remove("active");
  }
}

// Attach event listeners for change-pin actions
document.addEventListener("DOMContentLoaded", () => {
  const closeBtn = document.getElementById("change-pin-close-btn");
  const cancelBtn = document.getElementById("change-pin-cancel-btn");
  const requestBtn = document.getElementById("change-pin-request-btn");
  const form = document.getElementById("change-pin-form");

  if (closeBtn) closeBtn.addEventListener("click", closeChangePinModal);
  if (cancelBtn) cancelBtn.addEventListener("click", closeChangePinModal);

  // Step 1: Request OTP
  if (requestBtn) {
    requestBtn.addEventListener("click", async () => {
      const oldPin = document.getElementById("pin-current").value;
      const newPin = document.getElementById("pin-new").value;
      const confirmPin = document.getElementById("pin-confirm").value;
      const errorDiv = document.getElementById("change-pin-error");
      const successDiv = document.getElementById("change-pin-success");

      errorDiv.style.display = "none";
      successDiv.style.display = "none";

      if (!oldPin) {
        errorDiv.textContent = "Please enter your current PIN.";
        errorDiv.style.display = "block";
        return;
      }

      // Validations
      if (!/^\d{4}$/.test(newPin)) {
        errorDiv.textContent = "New PIN must be exactly 4 digits.";
        errorDiv.style.display = "block";
        return;
      }

      if (newPin !== confirmPin) {
        errorDiv.textContent = "New PIN and Confirmation PIN do not match.";
        errorDiv.style.display = "block";
        return;
      }

      try {
        const response = await fetch('/api/request-otp', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders()
          },
          body: JSON.stringify({ oldPin, newPin })
        });

        const data = await response.json();

        if (response.ok) {
          // Transition to Step 2
          document.getElementById("pin-otp-container").style.display = "block";
          document.getElementById("pin-otp").required = true;
          document.getElementById("change-pin-request-btn").style.display = "none";
          document.getElementById("change-pin-submit-btn").style.display = "block";
          document.getElementById("pin-otp").focus();
        } else {
          errorDiv.textContent = data.error || "Failed to request verification OTP.";
          errorDiv.style.display = "block";
        }
      } catch (err) {
        console.error("Failed to request OTP:", err);
        errorDiv.textContent = "Could not connect to server.";
        errorDiv.style.display = "block";
      }
    });
  }

  // Step 2: Submit OTP and Save
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      
      const otp = document.getElementById("pin-otp").value;
      const errorDiv = document.getElementById("change-pin-error");
      const successDiv = document.getElementById("change-pin-success");

      errorDiv.style.display = "none";
      successDiv.style.display = "none";

      if (!/^\d{6}$/.test(otp)) {
        errorDiv.textContent = "OTP must be exactly 6 digits.";
        errorDiv.style.display = "block";
        return;
      }

      try {
        const response = await fetch('/api/verify-otp', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders()
          },
          body: JSON.stringify({ otp })
        });

        const data = await response.json();

        if (response.ok) {
          successDiv.style.display = "block";
          
          // Clear inputs
          document.getElementById("pin-current").value = "";
          document.getElementById("pin-new").value = "";
          document.getElementById("pin-confirm").value = "";
          document.getElementById("pin-otp").value = "";
          
          // Close modal after a brief delay
          setTimeout(closeChangePinModal, 1500);
        } else {
          errorDiv.textContent = data.error || "Incorrect OTP. Please check your laptop server screen.";
          errorDiv.style.display = "block";
        }
      } catch (err) {
        console.error("Failed to verify OTP:", err);
        errorDiv.textContent = "Could not connect to server.";
        errorDiv.style.display = "block";
      }
    });
  }
});

// =======================================================
// THERMAL PRINTER HELPER FUNCTIONS
// =======================================================
function setupStoreSettings() {
  const savePrinterBtn = document.getElementById("settings-save-printer-btn");
  if (savePrinterBtn) {
    savePrinterBtn.addEventListener("click", async () => {
      const printerName = document.getElementById("settings-printer-name").value.trim();
      const autoPrint = document.getElementById("settings-auto-print").checked;
      const gstin = document.getElementById("settings-gstin").value.trim().toUpperCase();
      const statusDiv = document.getElementById("printer-settings-status");

      statusDiv.style.display = "block";
      statusDiv.style.color = "var(--text-secondary)";
      statusDiv.innerText = "Saving settings...";

      try {
        const response = await fetch('/api/save-printer', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders()
          },
          body: JSON.stringify({ printerName, autoPrint, gstin })
        });

        if (response.ok) {
          state.settings.printer_name = printerName || "Default";
          state.settings.auto_print = autoPrint ? "true" : "false";
          state.settings.gstin = gstin || "07AAAAA1111A1Z1";
          
          localStorage.setItem('fc_printer_name', state.settings.printer_name);
          localStorage.setItem('fc_auto_print', state.settings.auto_print);
          localStorage.setItem('fc_gstin', state.settings.gstin);

          statusDiv.style.color = "var(--success)";
          statusDiv.innerText = "Store settings saved successfully!";
          
          setTimeout(() => {
            statusDiv.style.display = "none";
          }, 3000);
        } else {
          const data = await response.json();
          statusDiv.style.color = "var(--danger)";
          statusDiv.innerText = data.error || "Failed to save settings.";
        }
      } catch (err) {
        console.error("Error saving printer settings:", err);
        statusDiv.style.color = "var(--danger)";
        statusDiv.innerText = "Network error. Failed to connect to server.";
      }
    });
  }

  // Bind Direct Print Button from Success Receipt modal
  const directPrintBtn = document.getElementById("receipt-direct-print-btn");
  if (directPrintBtn) {
    directPrintBtn.addEventListener("click", () => {
      if (!state.lastTransaction) return;
      const textReceipt = generateTextReceipt(state.lastTransaction);
      sendReceiptToPrinter(textReceipt);
    });
  }

  // Bind Bluetooth Print Button for Mobile Direct Printing
  const btPrintBtn = document.getElementById("receipt-bt-print-btn");
  if (btPrintBtn) {
    btPrintBtn.addEventListener("click", () => {
      if (!state.lastTransaction) return;
      const textReceipt = generateTextReceipt(state.lastTransaction);
      sendBluetoothPrint(textReceipt);
    });
  }
}

function sendBluetoothPrint(textReceipt) {
  // Construct RawBT Android Web Intent for Direct Bluetooth Printing
  const encodedText = encodeURIComponent(textReceipt);
  const rawbtIntent = `intent:${encodedText}#Intent;scheme=rawbt;package=ru.a42.rawbtprinter;end;`;
  
  // Trigger intent on Android device
  window.location.href = rawbtIntent;
}

async function sendReceiptToPrinter(receiptText) {
  const directPrintBtn = document.getElementById("receipt-direct-print-btn");
  const originalText = directPrintBtn ? directPrintBtn.innerHTML : "Direct Print";
  
  if (directPrintBtn) {
    directPrintBtn.disabled = true;
    directPrintBtn.innerHTML = `Printing...`;
  }

  try {
    const response = await fetch('/api/print', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify({ receiptText })
    });
    
    if (response.ok) {
      if (directPrintBtn) {
        directPrintBtn.innerHTML = `Success!`;
        directPrintBtn.classList.add("btn-success");
        directPrintBtn.classList.remove("btn-warning");
      }
    } else {
      const data = await response.json();
      alert(`Printing failed: ${data.error || 'Check printer connection and name'}`);
    }
  } catch (err) {
    console.error("Error printing receipt:", err);
    alert("Network error: Could not contact local print server.");
  } finally {
    setTimeout(() => {
      if (directPrintBtn) {
        directPrintBtn.disabled = false;
        directPrintBtn.innerHTML = originalText;
        directPrintBtn.classList.remove("btn-success");
        directPrintBtn.classList.add("btn-warning");
      }
    }, 2000);
  }
}

function generateTextReceipt(txn) {
  const line = "================================================";
  const dash = "------------------------------------------------";
  
  function centerText(text, width = 48) {
    const pad = Math.max(0, Math.floor((width - text.length) / 2));
    return " ".repeat(pad) + text;
  }

  let r = "";
  r += centerText("GULATI STORE") + "\n";
  r += centerText("Shop No. 5 Sector 2 Naya Nangal") + "\n";
  r += centerText("GSTIN: " + (state.settings.gstin || "07AAAAA1111A1Z1")) + "\n";
  r += line + "\n";
  r += `Date: ${new Date(txn.date).toLocaleString('en-IN')}\n`;
  r += `Invoice No: ${txn.id}\n`;
  if (txn.customerName && txn.customerName !== "Walk-in Customer") {
    r += `Customer: ${txn.customerName}\n`;
  }
  if (txn.customerPhone) {
    r += `Phone: ${txn.customerPhone}\n`;
  }
  r += dash + "\n";
  r += "Item                 Qty      Rate       Total\n";
  r += dash + "\n";
  
  txn.items.forEach(item => {
    const name = item.name.substring(0, 20).padEnd(20);
    const qty = item.quantity.toString().padStart(6);
    const rate = item.sellingPrice.toFixed(2).padStart(10);
    const total = (item.sellingPrice * item.quantity).toFixed(2).padStart(12);
    r += `${name}${qty}${rate}${total}\n`;
  });
  
  r += dash + "\n";
  
  r += "Subtotal (Excl. Tax):".padEnd(34) + formatRupeeText(txn.subtotal).padStart(14) + "\n";
  r += "GST Amount (CGST+SGST):".padEnd(34) + formatRupeeText(txn.gstAmount).padStart(14) + "\n";
  if (txn.discountAmount > 0) {
    r += "Discount:".padEnd(34) + ("-" + formatRupeeText(txn.discountAmount)).padStart(14) + "\n";
  }
  r += line + "\n";
  r += "GRAND TOTAL:".padEnd(30) + formatRupeeText(txn.totalPayable).padStart(18) + "\n";
  r += line + "\n";
  r += `Payment Method: ${txn.paymentMethod}\n`;
  r += "\n            Thank You! Visit Again.\n\n\n\n\n\n\n\n\n";
  r += "\u001d\u0056\u0001"; // ESC/POS Paper Cut Command (GS V 1)
  return r;
}

function formatRupeeText(val) {
  return "Rs." + parseFloat(val).toFixed(2);
}

// ----------------------------------------------------
// DISTRIBUTOR INVOICE IMPORTER (ITC, NESTLÉ, HUL, ETC.)
// ----------------------------------------------------
let distributorFileData = null;
let distributorHeaders = [];
let distributorParsedRows = [];
let customDistributorTemplates = JSON.parse(localStorage.getItem("fc_distributor_templates") || "[]");

function renderDistributorTemplateOptions() {
  const select = document.getElementById("distributor-preset-select");
  if (!select) return;

  const currentVal = select.value;
  select.innerHTML = `<option value="auto">⚡ Auto-Detect Column Headers</option>`;

  if (customDistributorTemplates.length > 0) {
    const optGroup = document.createElement("optgroup");
    optGroup.label = "⭐ Your Saved Custom Templates";
    customDistributorTemplates.forEach((tpl, idx) => {
      const opt = document.createElement("option");
      opt.value = `custom_${idx}`;
      opt.innerText = `⭐ ${tpl.name}`;
      optGroup.appendChild(opt);
    });
    select.appendChild(optGroup);
  }

  const factoryGroup = document.createElement("optgroup");
  factoryGroup.label = "🏢 Company Presets";
  [
    { val: 'itc', text: 'ITC Limited Invoice' },
    { val: 'nestle', text: 'Nestlé India Invoice' },
    { val: 'hul', text: 'Hindustan Unilever (HUL) Invoice' },
    { val: 'britannia', text: 'Britannia Industries Invoice' },
    { val: 'parle', text: 'Parle Products Invoice' },
    { val: 'amul', text: 'Amul / GCMMF Invoice' },
    { val: 'dabur', text: 'Dabur India Invoice' },
    { val: 'tally', text: 'Tally / Marg / Vyapar ERP Export' }
  ].forEach(preset => {
    const opt = document.createElement("option");
    opt.value = preset.val;
    opt.innerText = preset.text;
    factoryGroup.appendChild(opt);
  });
  select.appendChild(factoryGroup);

  if (currentVal) select.value = currentVal;
}

function setupTemplateManager() {
  renderDistributorTemplateOptions();

  const openBtn = document.getElementById("open-template-manager-btn");
  const modal = document.getElementById("bill-template-modal");
  const closeBtn = document.getElementById("template-modal-close");
  const cancelBtn = document.getElementById("template-modal-cancel");
  const form = document.getElementById("custom-template-form");

  if (!openBtn || !modal) return;

  openBtn.addEventListener("click", () => {
    modal.classList.add("active");
    form.reset();
  });

  const closeModal = () => modal.classList.remove("active");
  if (closeBtn) closeBtn.addEventListener("click", closeModal);
  if (cancelBtn) cancelBtn.addEventListener("click", closeModal);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const tpl = {
      name: document.getElementById("tpl-name").value.trim(),
      hdrName: document.getElementById("tpl-hdr-name").value.trim(),
      hdrHsn: document.getElementById("tpl-hdr-hsn").value.trim(),
      hdrCost: document.getElementById("tpl-hdr-cost").value.trim(),
      hdrMrp: document.getElementById("tpl-hdr-mrp").value.trim(),
      hdrGst: document.getElementById("tpl-hdr-gst").value.trim(),
      hdrQty: document.getElementById("tpl-hdr-qty").value.trim(),
      hdrSku: document.getElementById("tpl-hdr-sku").value.trim()
    };

    customDistributorTemplates.push(tpl);
    localStorage.setItem("fc_distributor_templates", JSON.stringify(customDistributorTemplates));
    renderDistributorTemplateOptions();

    const newIdx = customDistributorTemplates.length - 1;
    document.getElementById("distributor-preset-select").value = `custom_${newIdx}`;
    
    if (distributorHeaders.length > 0) {
      applyDistributorPreset(`custom_${newIdx}`);
      generateDistributorPreview();
    }

    modal.classList.remove("active");
    alert(`SUCCESS! Saved template '${tpl.name}'. You can now select it whenever uploading bills from this supplier.`);
  });
}

function setupPdfToExcelConverter() {
  const btn = document.getElementById("inv-pdf-to-excel-btn");
  if (!btn) return;

  // Create dynamic file input if not exists
  let fileInput = document.getElementById("pdf-to-excel-file-input");
  if (!fileInput) {
    fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.id = "pdf-to-excel-file-input";
    fileInput.accept = ".pdf";
    fileInput.style.display = "none";
    document.body.appendChild(fileInput);
  }

  btn.addEventListener("click", () => {
    fileInput.click();
  });

  fileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (typeof pdfjsLib === 'undefined' || typeof XLSX === 'undefined') {
      alert("Required libraries (PDF.js / SheetJS) are loading. Please wait a moment and try again.");
      return;
    }

    btn.innerText = "Converting PDF...";
    btn.disabled = true;

    try {
      try {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
      } catch (err) {
        console.warn("Could not set external PDF worker:", err);
      }

      const fileReader = new FileReader();
      fileReader.onload = async function(evt) {
        try {
          const typedarray = new Uint8Array(evt.target.result);
          const pdf = await pdfjsLib.getDocument({ data: typedarray }).promise;
          
          let allItems = [];
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            
            textContent.items.forEach(item => {
              const str = item.str ? item.str.trim() : "";
              if (!str) return;
              const x = item.transform[4];
              const y = item.transform[5];
              allItems.push({ str, x, y, page: i });
            });
          }

          if (allItems.length === 0) {
            alert("No text could be extracted from this PDF. Please verify it is a text-based PDF invoice.");
            resetBtn();
            return;
          }

          // 1. Group items on the same horizontal line using running average Y with 8px tolerance
          const sortedItemsByY = allItems.sort((a, b) => b.y - a.y);
          const rows = [];
          let currentRow = [];

          sortedItemsByY.forEach(item => {
            if (currentRow.length === 0) {
              currentRow.push(item);
            } else {
              const avgY = currentRow.reduce((sum, it) => sum + it.y, 0) / currentRow.length;
              if (Math.abs(item.y - avgY) <= 8) {
                currentRow.push(item);
              } else {
                rows.push(currentRow);
                currentRow = [item];
              }
            }
          });
          if (currentRow.length > 0) {
            rows.push(currentRow);
          }

          // Sort items in each row left-to-right
          rows.forEach(r => r.sort((a, b) => a.x - b.x));

          // 2. Identify Column Channels using X-Coordinate Clustering
          const allXCoordinates = [];
          rows.forEach(rowItems => {
            rowItems.forEach(item => {
              allXCoordinates.push(item.x);
            });
          });

          allXCoordinates.sort((a, b) => a - b);
          const columnClusters = [];
          allXCoordinates.forEach(x => {
            let cluster = columnClusters.find(c => Math.abs(c.center - x) < 20); // 20px tolerance
            if (!cluster) {
              cluster = { center: x, values: [] };
              columnClusters.push(cluster);
            }
            cluster.values.push(x);
            cluster.center = cluster.values.reduce((sum, v) => sum + v, 0) / cluster.values.length;
          });

          // Sort columns left-to-right
          columnClusters.sort((a, b) => a.center - b.center);

          // 3. Map items of each row into cell columns of the Excel grid
          const excelGrid = [];
          rows.forEach(rowItems => {
            const excelRow = Array(columnClusters.length).fill("");
            
            rowItems.forEach(item => {
              // Find closest column channel center
              let closestColIdx = 0;
              let minDiff = Infinity;
              columnClusters.forEach((col, idx) => {
                const diff = Math.abs(col.center - item.x);
                if (diff < minDiff) {
                  minDiff = diff;
                  closestColIdx = idx;
                }
              });

              // Concatenate text values falling in the same column cell
              excelRow[closestColIdx] = (excelRow[closestColIdx] + " " + item.str).trim();
            });

            excelGrid.push(excelRow);
          });

          // 4. Export to Excel (.xlsx) file
          const worksheet = XLSX.utils.aoa_to_sheet(excelGrid);
          const workbook = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(workbook, worksheet, "Parsed Table");

          // Auto-adjust column widths to make it readable
          const maxCols = columnClusters.length;
          const colWidths = [];
          for (let c = 0; c < maxCols; c++) {
            let maxLen = 10;
            excelGrid.forEach(row => {
              const val = row[c] || "";
              if (val.length > maxLen) maxLen = val.length;
            });
            colWidths.push({ wch: maxLen + 2 });
          }
          worksheet['!cols'] = colWidths;

          XLSX.writeFile(workbook, `${file.name.replace(/\.[^/.]+$/, "")}_converted.xlsx`);
          alert("SUCCESS! Converted PDF table to Excel spreadsheet. You can now open, verify, and upload it back directly!");
        } catch (err) {
          console.error("PDF-to-Excel conversion failed inside reader:", err);
          alert("Could not process PDF data. Please ensure it is a text-based PDF invoice.");
        } finally {
          resetBtn();
        }
      };

      fileReader.readAsArrayBuffer(file);
    } catch (err) {
      console.error("PDF-to-Excel conversion failed:", err);
      alert("Failed to convert PDF. Please ensure the file is not corrupted.");
      resetBtn();
    }

    function resetBtn() {
      btn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
        Convert PDF to Excel
      `;
      btn.disabled = false;
      fileInput.value = "";
    }
  });
}

function setupDistributorBillImporter() {
  const openBtn = document.getElementById("inv-distributor-bill-btn");
  const modal = document.getElementById("distributor-bill-modal");
  const closeBtn = document.getElementById("distributor-modal-close");
  const cancelBtn = document.getElementById("distributor-cancel-btn");
  const fileInput = document.getElementById("distributor-file-input");
  const presetSelect = document.getElementById("distributor-preset-select");
  const processBtn = document.getElementById("distributor-process-btn");

  setupTemplateManager();

  if (!openBtn || !modal) return;

  openBtn.addEventListener("click", () => {
    modal.classList.add("active");
    resetDistributorModal();
  });

  const closeModal = () => modal.classList.remove("active");
  if (closeBtn) closeBtn.addEventListener("click", closeModal);
  if (cancelBtn) cancelBtn.addEventListener("click", closeModal);

  fileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    readDistributorFile(file);
  });

  presetSelect.addEventListener("change", () => {
    if (distributorHeaders.length > 0) {
      applyDistributorPreset(presetSelect.value);
      generateDistributorPreview();
    }
  });

  // Column mapper change listeners
  ["map-col-name", "map-col-hsn", "map-col-cost", "map-col-mrp", "map-col-gst", "map-col-qty", "map-col-sku"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", generateDistributorPreview);
  });

  processBtn.addEventListener("click", processDistributorImport);
}

function resetDistributorModal() {
  document.getElementById("distributor-file-input").value = "";
  document.getElementById("distributor-mapping-section").style.display = "none";
  document.getElementById("distributor-preview-container").style.display = "none";
  document.getElementById("distributor-summary-text").innerText = "No file loaded.";
  document.getElementById("distributor-process-btn").disabled = true;
  distributorFileData = null;
  distributorHeaders = [];
  distributorParsedRows = [];
}

function readDistributorFile(file) {
  if (file.name.toLowerCase().endsWith('.pdf')) {
    readDistributorPdf(file);
    return;
  }

  if (typeof XLSX === 'undefined') {
    alert("Excel parsing library is loading. Please wait a moment and try again.");
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      
      const jsonRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
      if (!jsonRows || jsonRows.length < 2) {
        alert("The uploaded file does not contain enough data rows.");
        return;
      }

      // Find Header Row (first row with non-empty text cells)
      let headerIndex = 0;
      for (let i = 0; i < Math.min(jsonRows.length, 10); i++) {
        const row = jsonRows[i];
        if (Array.isArray(row) && row.filter(cell => cell.toString().trim() !== "").length >= 2) {
          headerIndex = i;
          break;
        }
      }

      distributorHeaders = jsonRows[headerIndex].map((h, idx) => h ? h.toString().trim() : `Column ${idx + 1}`);
      
      // Parse Rows below Header
      distributorParsedRows = [];
      for (let i = headerIndex + 1; i < jsonRows.length; i++) {
        const row = jsonRows[i];
        if (!Array.isArray(row) || row.every(cell => cell.toString().trim() === "")) continue;
        const rowObj = {};
        distributorHeaders.forEach((colName, colIdx) => {
          rowObj[colName] = row[colIdx] !== undefined ? row[colIdx].toString().trim() : "";
        });
        distributorParsedRows.push(rowObj);
      }

      populateColumnMappers();
      const preset = document.getElementById("distributor-preset-select").value;
      applyDistributorPreset(preset);
      generateDistributorPreview();

      document.getElementById("distributor-mapping-section").style.display = "block";
      document.getElementById("distributor-preview-container").style.display = "block";
    } catch (err) {
      console.error("Failed to read distributor bill file:", err);
      alert("Could not parse file. Please ensure it is a valid Excel (.xlsx/.xls) or CSV file.");
    }
  };
  reader.readAsArrayBuffer(file);
}

function populateColumnMappers() {
  const mappers = ["map-col-name", "map-col-hsn", "map-col-cost", "map-col-mrp", "map-col-gst", "map-col-qty", "map-col-sku"];
  mappers.forEach(id => {
    const select = document.getElementById(id);
    if (!select) return;
    select.innerHTML = `<option value="">-- Select Column --</option>`;
    distributorHeaders.forEach(header => {
      const opt = document.createElement("option");
      opt.value = header;
      opt.innerText = header;
      select.appendChild(opt);
    });
  });
}

let distributorActivePreviewRows = [];

function applyDistributorPreset(presetKey) {
  const findCol = (keywords) => {
    if (!keywords || keywords.length === 0) return "";
    const activeKws = keywords.filter(k => k && k.trim() !== "");
    if (activeKws.length === 0) return "";

    // 1. Exact case-insensitive check first
    for (const kw of activeKws) {
      const target = kw.toLowerCase().trim();
      const match = distributorHeaders.find(h => h.toLowerCase().trim() === target);
      if (match) return match;
    }

    // 2. Fuzzy clean alphanumeric check
    return distributorHeaders.find(h => {
      const cleanHeader = h.toLowerCase().replace(/[^a-z0-9]/g, '');
      return activeKws.some(k => {
        const cleanKw = k.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!cleanKw) return false;
        return cleanHeader.includes(cleanKw) || cleanKw.includes(cleanHeader);
      });
    }) || "";
  };

  if (presetKey && presetKey.startsWith("custom_")) {
    const idx = parseInt(presetKey.replace("custom_", ""));
    const tpl = customDistributorTemplates[idx];
    if (tpl) {
      setVal("map-col-name", findCol([tpl.hdrName]));
      setVal("map-col-hsn", findCol([tpl.hdrHsn]));
      setVal("map-col-cost", findCol([tpl.hdrCost]));
      setVal("map-col-mrp", findCol([tpl.hdrMrp]));
      setVal("map-col-gst", findCol([tpl.hdrGst]));
      setVal("map-col-qty", findCol([tpl.hdrQty]));
      setVal("map-col-sku", findCol([tpl.hdrSku]));
      return;
    }
  }

  const nameCol = findCol(["item description", "product description", "material description", "item name", "product name", "description", "particulars", "item", "product", "article", "goods", "desc", "title", "particular", "name"]);
  const hsnCol = findCol(["hsn sac", "hsn code", "hsncode", "hsn", "sac", "tariff"]);
  const costCol = findCol(["billing rate", "basic rate", "purchase rate", "unit rate", "buy rate", "purchase price", "taxable value", "ptr", "rlp", "basic", "cost", "rate", "price", "amount"]);
  const mrpCol = findCol(["mrp", "sale rate", "selling price", "sale price", "retail price", "list price", "consumer price", "saleprice", "salerate"]);
  const gstCol = findCol(["gst rate", "gst percentage", "tax rate", "tax percentage", "cgst sgst", "gst", "tax", "vat", "igst", "cgst", "sgst"]);
  const qtyCol = findCol(["billed qty", "billing qty", "inv qty", "quantity", "billed quantity", "qty", "pcs", "cases", "ea", "cs", "boxes", "nos", "count", "units", "pack"]);
  const skuCol = findCol(["ean code", "material code", "item code", "article code", "code", "barcode", "ean", "sku", "upc", "gtin", "bar code"]);

  setVal("map-col-name", nameCol);
  setVal("map-col-hsn", hsnCol);
  setVal("map-col-cost", costCol);
  setVal("map-col-mrp", mrpCol);
  setVal("map-col-gst", gstCol);
  setVal("map-col-qty", qtyCol);
  setVal("map-col-sku", skuCol);
}

function setVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val || "";
}

function generateDistributorPreview() {
  const colName = document.getElementById("map-col-name").value;
  const colHsn = document.getElementById("map-col-hsn").value;
  const colCost = document.getElementById("map-col-cost").value;
  const colMrp = document.getElementById("map-col-mrp").value;
  const colGst = document.getElementById("map-col-gst").value;
  const colQty = document.getElementById("map-col-qty").value;
  const colSku = document.getElementById("map-col-sku").value;

  distributorActivePreviewRows = [];

  if (!colName) {
    document.getElementById("distributor-preview-tbody").innerHTML = "";
    document.getElementById("distributor-summary-text").innerText = "Please select Item Name Column.";
    document.getElementById("distributor-process-btn").disabled = true;
    return;
  }

  distributorParsedRows.forEach((row, rawIdx) => {
    const rawName = row[colName] ? row[colName].toString().trim() : "";
    if (!rawName) return;

    const name = rawName.charAt(0).toUpperCase() + rawName.slice(1);
    const sku = colSku && row[colSku] ? String(row[colSku]).trim() : `BILL_${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    const hsn = colHsn && row[colHsn] ? String(row[colHsn]).trim().replace(/[^0-9]/g, '') : "2106";
    const costPrice = colCost && row[colCost] ? parseFloat(row[colCost].toString().replace(/[^0-9.]/g, '')) || 0 : 0;
    
    // MRP Fallback: Use cost price if MRP is not defined or is 0
    let sellingPrice = colMrp && row[colMrp] ? parseFloat(row[colMrp].toString().replace(/[^0-9.]/g, '')) || 0 : 0;
    if (sellingPrice === 0) {
      sellingPrice = costPrice;
    }

    const gstSlab = colGst && row[colGst] ? parseFloat(row[colGst].toString().replace(/[^0-9.]/g, '')) || 18 : 18;
    const qty = colQty && row[colQty] ? parseFloat(row[colQty].toString().replace(/[^0-9.]/g, '')) || 1 : 1;

    distributorActivePreviewRows.push({
      id: rawIdx,
      sku,
      name,
      hsn,
      costPrice,
      sellingPrice,
      gstSlab,
      qty
    });
  });

  renderDistributorPreviewTable();
}

function renderDistributorPreviewTable() {
  const tbody = document.getElementById("distributor-preview-tbody");
  tbody.innerHTML = "";

  let newCount = 0;
  let updateCount = 0;

  distributorActivePreviewRows.forEach((item, previewIdx) => {
    const existing = state.products.find(p => String(p.sku || p.id).toLowerCase() === item.sku.toLowerCase() || p.name.toLowerCase() === item.name.toLowerCase());

    let statusBadge = "";
    if (existing) {
      updateCount++;
      statusBadge = `<span class="badge badge-warning" style="font-size:10px;">Update Stock (+${item.qty})</span>`;
    } else {
      newCount++;
      statusBadge = `<span class="badge badge-success" style="font-size:10px;">New Item (+${item.qty})</span>`;
    }

    const tr = document.createElement("tr");
    tr.style.borderBottom = "1px solid var(--border-color)";
    tr.innerHTML = `
      <td style="padding:6px 8px;">${statusBadge}</td>
      <td style="padding:6px 8px; font-family:monospace;">${existing ? existing.sku : item.sku}</td>
      <td style="padding:6px 8px; font-weight:600;">${item.name}</td>
      <td style="padding:6px 8px;">${item.hsn}</td>
      <td style="padding:6px 8px;">₹${item.costPrice.toFixed(2)}</td>
      <td style="padding:6px 8px;">₹${item.sellingPrice.toFixed(2)}</td>
      <td style="padding:6px 8px;">${item.gstSlab}%</td>
      <td style="padding:6px 8px; font-weight:700;">+${item.qty}</td>
      <td style="padding:6px 8px; text-align:center;">
        <button class="btn btn-secondary" onclick="deleteDistributorPreviewRow(${previewIdx})" title="Delete Row from Import" style="color:var(--danger); border-color:rgba(239,68,68,0.4); padding:4px 10px; font-size:12px; display:inline-flex; align-items:center; gap:4px; font-weight:600; cursor:pointer;">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          Delete
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  const totalParsed = distributorActivePreviewRows.length;
  document.getElementById("distributor-summary-text").innerText = `Ready to import ${totalParsed} items (${newCount} New Products, ${updateCount} Stock Updates).`;
  document.getElementById("distributor-process-btn").disabled = totalParsed === 0;
}

window.deleteDistributorPreviewRow = function(previewIdx) {
  if (previewIdx >= 0 && previewIdx < distributorActivePreviewRows.length) {
    distributorActivePreviewRows.splice(previewIdx, 1);
    renderDistributorPreviewTable();
  }
};

async function processDistributorImport() {
  const btn = document.getElementById("distributor-process-btn");
  btn.disabled = true;
  btn.innerText = "Syncing Inventory...";

  let importedCount = 0;

  distributorActivePreviewRows.forEach(item => {
    const existingIndex = state.products.findIndex(p => String(p.sku || p.id).toLowerCase() === item.sku.toLowerCase() || p.name.toLowerCase() === item.name.toLowerCase());

    if (existingIndex >= 0) {
      // Update Stock and Prices of Existing Item
      state.products[existingIndex].stock += item.qty;
      if (item.costPrice > 0) state.products[existingIndex].costPrice = item.costPrice;
      if (item.sellingPrice > 0) state.products[existingIndex].sellingPrice = item.sellingPrice;
      if (item.hsn) state.products[existingIndex].hsn = item.hsn;
      if (item.gstSlab >= 0) state.products[existingIndex].gstSlab = item.gstSlab;
    } else {
      // Add Brand New Item to Inventory
      state.products.push({
        sku: item.sku,
        name: item.name,
        category: "Distributor FMCG",
        hsn: item.hsn,
        costPrice: item.costPrice,
        sellingPrice: item.sellingPrice,
        gstSlab: item.gstSlab,
        discountPercent: 0,
        stock: item.qty,
        reorderLevel: 10,
        unit: "pcs"
      });
    }
    importedCount++;
  });

  // Save to Storage & Cloud Database
  saveProductsToStorage();
  renderInventory();
  renderPOSCatalog();

  document.getElementById("distributor-bill-modal").classList.remove("active");
  btn.innerText = "Import & Sync Inventory";
  alert(`SUCCESS! Successfully imported distributor bill and updated inventory (${importedCount} items synced).`);
}

async function readDistributorPdf(file) {
  if (typeof pdfjsLib === 'undefined') {
    alert("PDF parsing library is loading. Please wait a moment and try again.");
    return;
  }

  // Safe loading of PDF worker to avoid CORS security policy blocks
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
  } catch (err) {
    console.warn("Could not set external PDF worker, falling back to main-thread rendering:", err);
  }

  const reader = new FileReader();
  reader.onload = async function(e) {
    try {
      const typedarray = new Uint8Array(e.target.result);
      const pdf = await pdfjsLib.getDocument({ data: typedarray }).promise;
      
      let allItems = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        
        textContent.items.forEach(item => {
          const str = item.str ? item.str.trim() : "";
          if (!str) return;
          const x = item.transform[4];
          const y = item.transform[5];
          allItems.push({ str, x, y, page: i });
        });
      }

      parseStructuredPdfTable(allItems);
    } catch (err) {
      console.error("Failed to parse PDF invoice:", err);
      alert("Could not read PDF invoice. Please ensure it is a text-based PDF invoice or try exporting as Excel/CSV.");
    }
  };
  reader.readAsArrayBuffer(file);
}

function parseStructuredPdfTable(allItems) {
  if (!allItems || allItems.length === 0) return;

  // 1. Group items on the same horizontal line using running average Y with 8px tolerance
  const sortedItemsByY = allItems.slice().sort((a, b) => b.y - a.y); // top to bottom
  const rows = [];
  let currentRow = [];

  sortedItemsByY.forEach(item => {
    if (currentRow.length === 0) {
      currentRow.push(item);
    } else {
      const avgY = currentRow.reduce((sum, it) => sum + it.y, 0) / currentRow.length;
      if (Math.abs(item.y - avgY) <= 8) {
        currentRow.push(item);
      } else {
        rows.push(currentRow);
        currentRow = [item];
      }
    }
  });
  if (currentRow.length > 0) {
    rows.push(currentRow);
  }

  // Sort items in each row left-to-right
  rows.forEach(r => r.sort((a, b) => a.x - b.x));

  // 2. Identify Product Data Rows
  const dataRows = [];
  rows.forEach(rowItems => {
    // Find the first non-empty text item
    const firstItem = rowItems.find(it => it.str.trim() !== "");
    if (!firstItem) return;

    // SN Check: First item must be an integer between 1 and 150, starting in leftmost 120px
    const snStr = firstItem.str.trim();
    const snNum = parseInt(snStr);
    const isSn = !isNaN(snNum) && snNum > 0 && snNum < 150 && firstItem.x < 120;
    
    if (!isSn) return;

    // Row must contain at least 2 numbers (like Qty, Rate, HSN, etc.)
    const numericCount = rowItems.filter(it => {
      const val = parseFloat(it.str.replace(/[^0-9.]/g, ''));
      return !isNaN(val) && val > 0;
    }).length;

    // Check if the row contains an HSN code (typically a 4-8 digit number)
    const hasHsn = rowItems.some(it => {
      const cleanStr = it.str.trim().replace(/\s/g, '');
      return /^\d{4,8}$/.test(cleanStr);
    });

    const hasManyCols = rowItems.length >= 5;

    if ((hasHsn || hasManyCols) && numericCount >= 2) {
      dataRows.push(rowItems);
    }
  });

  if (dataRows.length === 0) {
    // Fallback to basic line extraction if no structured data rows matched
    distributorHeaders = ["Item Description", "HSN Code", "Basic Rate", "MRP", "GST %", "Billed Qty", "Item Code"];
    distributorParsedRows = [];
    rows.forEach(rowItems => {
      const line = rowItems.map(it => it.str).join(" ").trim();
      const lower = line.toLowerCase();
      if (lower.includes("invoice") || lower.includes("subtotal") || lower.includes("grand total") || lower.includes("bank") || lower.includes("terms") || lower.includes("gstin") || line.length < 5) return;

      const numbers = line.match(/\d+(\.\d+)?/g);
      if (!numbers || numbers.length < 2) return;

      const nameMatch = line.match(/^[a-zA-Z0-9\s\-\.&\(\)\/]+/);
      if (!nameMatch || nameMatch[0].trim().length < 3) return;

      const name = nameMatch[0].replace(/^\d+\s*/, '').trim();
      if (name.length < 3 || lower.includes("page") || lower.includes("total")) return;

      let hsn = "2106";
      const hsnMatch = line.match(/\b(040\d|190\d|110\d|151\d|220\d|340\d|180\d|250\d|\d{4}|\d{6}|\d{8})\b/);
      if (hsnMatch) hsn = hsnMatch[0];

      const floatVals = numbers.map(n => parseFloat(n)).filter(n => !isNaN(n));
      let costPrice = 0, sellingPrice = 0, gstSlab = 18, qty = 1;

      floatVals.forEach(val => {
        if (val === 5 || val === 12 || val === 18 || val === 28) gstSlab = val;
        else if (val > 10 && val < 5000 && costPrice === 0) costPrice = val;
        else if (val > costPrice && val < 6000 && sellingPrice === 0) sellingPrice = val;
        else if (val >= 1 && val <= 500 && qty === 1 && val !== costPrice && val !== sellingPrice) qty = val;
      });

      if (sellingPrice === 0) sellingPrice = costPrice;

      distributorParsedRows.push({
        "Item Description": name,
        "HSN Code": hsn,
        "Basic Rate": costPrice.toString(),
        "MRP": sellingPrice.toString(),
        "GST %": gstSlab.toString(),
        "Billed Qty": qty.toString(),
        "Item Code": `PDF_${Math.random().toString(36).substr(2, 6).toUpperCase()}`
      });
    });

    populateColumnMappers();
    applyDistributorPreset("auto");
    generateDistributorPreview();

    document.getElementById("distributor-mapping-section").style.display = "block";
    document.getElementById("distributor-preview-container").style.display = "block";
    return;
  }

  // 3. Cluster X Coordinates to Identify Column Channels
  const allXCoordinates = [];
  dataRows.forEach(rowItems => {
    rowItems.forEach(item => {
      allXCoordinates.push(item.x);
    });
  });

  allXCoordinates.sort((a, b) => a - b);
  const columnClusters = [];
  allXCoordinates.forEach(x => {
    let cluster = columnClusters.find(c => Math.abs(c.center - x) < 20); // 20px tolerance
    if (!cluster) {
      cluster = { center: x, values: [] };
      columnClusters.push(cluster);
    }
    cluster.values.push(x);
    cluster.center = cluster.values.reduce((sum, v) => sum + v, 0) / cluster.values.length;
  });

  columnClusters.sort((a, b) => a.center - b.center);

  // 4. Find Header Y Coordinates (above first data row)
  const firstDataY = dataRows[0][0].y;
  
  // Reconstruct column header names by collecting text items near each column cluster center
  distributorHeaders = columnClusters.map((col, colIdx) => {
    let titleParts = [];
    rows.forEach(rowItems => {
      rowItems.forEach(item => {
        if (item.y > firstDataY && item.y < firstDataY + 150) {
          if (Math.abs(item.x - col.center) < 25) {
            titleParts.push({ str: item.str.trim(), y: item.y });
          }
        }
      });
    });

    titleParts.sort((a, b) => b.y - a.y);
    const title = titleParts.map(p => p.str).join(" ").trim();
    return title || `Column ${colIdx + 1}`;
  });

  // 5. Reconstruct Data Rows
  distributorParsedRows = [];
  dataRows.forEach(rowItems => {
    const rowObj = {};
    distributorHeaders.forEach(h => rowObj[h] = "");

    rowItems.forEach(item => {
      let closestColIdx = 0;
      let minDiff = Infinity;
      columnClusters.forEach((col, idx) => {
        const diff = Math.abs(col.center - item.x);
        if (diff < minDiff) {
          minDiff = diff;
          closestColIdx = idx;
        }
      });

      const colName = distributorHeaders[closestColIdx];
      rowObj[colName] = (rowObj[colName] + " " + item.str).trim();
    });

    distributorParsedRows.push(rowObj);
  });

  populateColumnMappers();

  const presetKey = document.getElementById("distributor-preset-select").value;
  applyDistributorPreset(presetKey);
  generateDistributorPreview();

  document.getElementById("distributor-mapping-section").style.display = "block";
  document.getElementById("distributor-preview-container").style.display = "block";
}

function parseFallbackPdfLines(sortedYKeys, rowsByY) {
  sortedYKeys.forEach(y => {
    const lineItems = rowsByY[y].sort((a, b) => a.x - b.x);
    const line = lineItems.map(it => it.str).join(" ").trim();
    const lower = line.toLowerCase();
    if (lower.includes("invoice") || lower.includes("subtotal") || lower.includes("grand total") || lower.includes("bank") || lower.includes("terms") || lower.includes("gstin") || line.length < 5) return;

    const numbers = line.match(/\d+(\.\d+)?/g);
    if (!numbers || numbers.length < 2) return;

    const nameMatch = line.match(/^[a-zA-Z0-9\s\-\.&\(\)\/]+/);
    if (!nameMatch || nameMatch[0].trim().length < 3) return;

    const name = nameMatch[0].replace(/^\d+\s*/, '').trim();
    if (name.length < 3 || lower.includes("page") || lower.includes("total")) return;

    let hsn = "2106";
    const hsnMatch = line.match(/\b(040\d|190\d|110\d|151\d|220\d|340\d|180\d|250\d|\d{4}|\d{6}|\d{8})\b/);
    if (hsnMatch) hsn = hsnMatch[0];

    const floatVals = numbers.map(n => parseFloat(n)).filter(n => !isNaN(n));
    let costPrice = 0, sellingPrice = 0, gstSlab = 18, qty = 1;

    floatVals.forEach(val => {
      if (val === 5 || val === 12 || val === 18 || val === 28) gstSlab = val;
      else if (val > 10 && val < 5000 && costPrice === 0) costPrice = val;
      else if (val > costPrice && val < 6000 && sellingPrice === 0) sellingPrice = val;
      else if (val >= 1 && val <= 500 && qty === 1 && val !== costPrice && val !== sellingPrice) qty = val;
    });

    if (sellingPrice === 0) sellingPrice = costPrice;

    distributorParsedRows.push({
      "Item Description": name,
      "HSN Code": hsn,
      "Basic Rate": costPrice.toString(),
      "MRP": sellingPrice.toString(),
      "GST %": gstSlab.toString(),
      "Billed Qty": qty.toString(),
      "Item Code": `PDF_${Math.random().toString(36).substr(2, 6).toUpperCase()}`
    });
  });

  populateColumnMappers();
  applyDistributorPreset("auto");
  generateDistributorPreview();

  document.getElementById("distributor-mapping-section").style.display = "block";
  document.getElementById("distributor-preview-container").style.display = "block";
}
