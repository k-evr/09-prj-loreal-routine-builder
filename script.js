/* ============================================================
   L'Oréal Smart Routine Advisor — script.js
   ============================================================ */

/* ─── DOM refs ─────────────────────────────────────────────── */
const categoryFilter     = document.getElementById("categoryFilter");
const productSearch      = document.getElementById("productSearch");
const productsContainer  = document.getElementById("productsContainer");
const selectedList       = document.getElementById("selectedProductsList");
const generateBtn        = document.getElementById("generateRoutine");
const chatForm           = document.getElementById("chatForm");
const chatWindow         = document.getElementById("chatWindow");
const userInput          = document.getElementById("userInput");
const sendBtn            = document.getElementById("sendBtn");
const clearAllBtn        = document.getElementById("clearAllBtn");
const rtlToggle          = document.getElementById("rtlToggle");
const descModal          = document.getElementById("descModal");
const modalClose         = document.getElementById("modalClose");
const modalImg           = document.getElementById("modalImg");
const modalBrand         = document.getElementById("modalBrand");
const modalProductName   = document.getElementById("modalProductName");
const modalCategory      = document.getElementById("modalCategory");
const modalDesc          = document.getElementById("modalDesc");
const modalAddBtn        = document.getElementById("modalAddBtn");

/* ─── State ─────────────────────────────────────────────────── */
let allProducts      = [];          // full product catalogue
let filteredProducts = [];          // currently visible in grid
let selectedIds      = new Set();   // selected product IDs
let conversationHistory = [];       // [{role, content}]
let currentModalProduct = null;     // product shown in modal

/* ─── API helper ────────────────────────────────────────────── */
async function callAPI(messages, useWebSearch = false) {
  const endpoint = (typeof WORKER_URL !== "undefined" && WORKER_URL)
    ? WORKER_URL
    : "https://api.openai.com/v1/chat/completions";

  const SYSTEM_PROMPT = `You are a helpful L'Oréal beauty advisor. You specialise in skincare, haircare, makeup, fragrance, and general beauty routines. Only answer questions related to beauty, skincare, haircare, makeup, fragrance, grooming, and L'Oréal products. When generating a routine, structure it clearly with numbered steps and helpful tips. If asked about topics unrelated to beauty or the generated routine, politely redirect the conversation. Format your responses with clear headings where appropriate. Use **bold** for product names and step titles.`;

  const body = {
    model: "gpt-4o-mini",
    max_tokens: 1024,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      ...messages
    ]
  };

  const headers = { "Content-Type": "application/json" };

  /* Add API key only for direct calls (not via Worker) */
  if (!(typeof WORKER_URL !== "undefined" && WORKER_URL)) {
    if (typeof ANTHROPIC_API_KEY !== "undefined" && ANTHROPIC_API_KEY) {
      headers["Authorization"] = `Bearer ${ANTHROPIC_API_KEY}`;
    }
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API error ${response.status}: ${err}`);
  }

  return response.json();
}

/* Extract text — handles both OpenAI and Anthropic response formats */
function parseAPIResponse(data) {
  /* OpenAI: data.choices[0].message.content */
  if (data.choices && data.choices.length) {
    return { text: data.choices[0].message?.content || "" };
  }
  /* Anthropic: data.content[].text */
  if (data.content && data.content.length) {
    let text = "";
    for (const block of data.content) {
      if (block.type === "text") text += block.text;
    }
    return { text };
  }
  return { text: "No response received." };
}

/* ─── Products ──────────────────────────────────────────────── */
async function loadProducts() {
  if (allProducts.length) return allProducts;
  const res = await fetch("products.json");
  const data = await res.json();
  allProducts = data.products;
  return allProducts;
}

function buildProductCard(product) {
  const isSelected = selectedIds.has(product.id);
  const div = document.createElement("div");
  div.className = "product-card" + (isSelected ? " selected" : "");
  div.dataset.productId = product.id;
  div.setAttribute("role", "button");
  div.setAttribute("tabindex", "0");
  div.setAttribute("aria-pressed", isSelected ? "true" : "false");
  div.setAttribute("aria-label", product.name);

  div.innerHTML = `
    <img src="${product.image}" alt="${product.name}" loading="lazy" onerror="this.src='https://via.placeholder.com/90x90/f5f5f5/ccc?text=img'">
    <div class="product-info">
      <span class="product-brand">${product.brand}</span>
      <h3 class="product-name">${product.name}</h3>
      <span class="product-cat-badge">${product.category}</span>
      <button class="product-desc-btn" data-product-id="${product.id}" aria-label="View description for ${product.name}">
        <i class="fa-solid fa-circle-info"></i> Details
      </button>
    </div>
  `;

  /* Toggle selection on card click (but not on the Details button) */
  div.addEventListener("click", (e) => {
    if (e.target.closest(".product-desc-btn")) return;
    toggleProduct(product.id);
  });

  div.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && !e.target.closest(".product-desc-btn")) {
      e.preventDefault();
      toggleProduct(product.id);
    }
  });

  /* Details button opens modal */
  div.querySelector(".product-desc-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    openModal(product);
  });

  return div;
}

function displayProducts(products) {
  productsContainer.innerHTML = "";

  if (!products.length) {
    productsContainer.innerHTML = `
      <div class="placeholder-message">
        <i class="fa-solid fa-magnifying-glass placeholder-icon"></i>
        <p>No products match your search.</p>
      </div>`;
    return;
  }

  const fragment = document.createDocumentFragment();
  products.forEach(p => fragment.appendChild(buildProductCard(p)));
  productsContainer.appendChild(fragment);
}

async function applyFilters() {
  const products = await loadProducts();
  const category = categoryFilter.value;
  const query    = productSearch.value.trim().toLowerCase();

  filteredProducts = products.filter(p => {
    const matchCat = !category || p.category === category;
    const matchQ   = !query ||
      p.name.toLowerCase().includes(query) ||
      p.brand.toLowerCase().includes(query) ||
      p.category.toLowerCase().includes(query) ||
      p.description.toLowerCase().includes(query);
    return matchCat && matchQ;
  });

  if (!category && !query) {
    productsContainer.innerHTML = `
      <div class="placeholder-message">
        <i class="fa-solid fa-spa placeholder-icon"></i>
        <p>Select a category or search to explore products</p>
      </div>`;
    return;
  }

  displayProducts(filteredProducts);
}

/* ─── Selection ─────────────────────────────────────────────── */
function toggleProduct(id) {
  if (selectedIds.has(id)) {
    selectedIds.delete(id);
  } else {
    selectedIds.add(id);
  }
  saveSelectionToStorage();
  refreshSelectedSection();
  /* Update card visual if it's currently displayed */
  const card = productsContainer.querySelector(`[data-product-id="${id}"]`);
  if (card) {
    const product = allProducts.find(p => p.id === id);
    const newCard = buildProductCard(product);
    card.replaceWith(newCard);
  }
}

function refreshSelectedSection() {
  if (!selectedIds.size) {
    selectedList.innerHTML = `<p class="empty-selection">No products selected yet — click any product card to add it.</p>`;
    return;
  }

  selectedList.innerHTML = "";
  selectedIds.forEach(id => {
    const p = allProducts.find(x => x.id === id);
    if (!p) return;
    const chip = document.createElement("div");
    chip.className = "selected-chip";
    chip.innerHTML = `
      <span>${p.name}</span>
      <button class="chip-remove" data-remove="${id}" aria-label="Remove ${p.name}">
        <i class="fa-solid fa-xmark"></i>
      </button>
    `;
    chip.querySelector(".chip-remove").addEventListener("click", () => {
      toggleProduct(id);
    });
    selectedList.appendChild(chip);
  });
}

/* ─── localStorage ──────────────────────────────────────────── */
function saveSelectionToStorage() {
  localStorage.setItem("loreal_selected", JSON.stringify([...selectedIds]));
}

function loadSelectionFromStorage() {
  try {
    const saved = localStorage.getItem("loreal_selected");
    if (saved) {
      const arr = JSON.parse(saved);
      selectedIds = new Set(arr);
    }
  } catch (_) { selectedIds = new Set(); }
}

/* ─── Modal ─────────────────────────────────────────────────── */
function openModal(product) {
  currentModalProduct = product;
  modalImg.src = product.image;
  modalImg.alt = product.name;
  modalBrand.textContent = product.brand;
  modalProductName.textContent = product.name;
  modalCategory.textContent = product.category;
  modalDesc.textContent = product.description;

  const isSelected = selectedIds.has(product.id);
  modalAddBtn.textContent = "";
  modalAddBtn.className = "modal-add-btn" + (isSelected ? " added" : "");
  modalAddBtn.innerHTML = isSelected
    ? `<i class="fa-solid fa-circle-check"></i> Added to Selection`
    : `<i class="fa-solid fa-circle-plus"></i> Add to Selection`;

  descModal.hidden = false;
  document.body.style.overflow = "hidden";
  modalClose.focus();
}

function closeModal() {
  descModal.hidden = true;
  document.body.style.overflow = "";
  currentModalProduct = null;
}

modalClose.addEventListener("click", closeModal);
descModal.addEventListener("click", (e) => {
  if (e.target === descModal) closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !descModal.hidden) closeModal();
});

modalAddBtn.addEventListener("click", () => {
  if (!currentModalProduct) return;
  toggleProduct(currentModalProduct.id);
  const isSelected = selectedIds.has(currentModalProduct.id);
  modalAddBtn.className = "modal-add-btn" + (isSelected ? " added" : "");
  modalAddBtn.innerHTML = isSelected
    ? `<i class="fa-solid fa-circle-check"></i> Added to Selection`
    : `<i class="fa-solid fa-circle-plus"></i> Add to Selection`;
});

/* ─── Chat helpers ──────────────────────────────────────────── */
function appendMessage(role, content) {
  const msg = document.createElement("div");
  msg.className = `chat-msg ${role}`;

  const avatar = document.createElement("div");
  avatar.className = "chat-avatar";
  avatar.textContent = role === "user" ? "You" : "L";

  const bubble = document.createElement("div");
  bubble.className = "chat-bubble";
  bubble.innerHTML = formatMessage(content);

  msg.appendChild(avatar);
  msg.appendChild(bubble);
  chatWindow.appendChild(msg);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return msg;
}

function formatMessage(text) {
  return text
    .replace(/^#### (.+)$/gm, "<h4>$1</h4>")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>)/gs, "<ul>$1</ul>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br>")
    .replace(/^(?!<[hul])/, "<p>")
    .replace(/(?<![>])$/, "</p>");
}

function showTyping() {
  const msg = document.createElement("div");
  msg.className = "chat-msg assistant";
  msg.id = "typing-msg";
  msg.innerHTML = `
    <div class="chat-avatar">L</div>
    <div class="chat-bubble"><div class="typing-indicator"><span></span><span></span><span></span></div></div>
  `;
  chatWindow.appendChild(msg);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function removeTyping() {
  const t = document.getElementById("typing-msg");
  if (t) t.remove();
}

function setChatDisabled(disabled) {
  userInput.disabled = disabled;
  sendBtn.disabled   = disabled;
  generateBtn.disabled = disabled;
}

/* ─── Generate Routine ──────────────────────────────────────── */
generateBtn.addEventListener("click", async () => {
  if (!selectedIds.size) {
    alert("Please select at least one product before generating a routine.");
    return;
  }

  await loadProducts();
  const selected = allProducts.filter(p => selectedIds.has(p.id));

  const productSummary = selected.map(p =>
    `- **${p.name}** by ${p.brand} (${p.category}): ${p.description}`
  ).join("\n");

  const prompt = `I have selected the following L'Oréal products:

${productSummary}

Please create a personalised beauty routine using these products. Include:
1. The recommended order and timing (morning/evening/weekly) for each product.
2. How to apply each product correctly.
3. Any tips for combining these products effectively.
4. Any warnings about potential interactions or ingredients to watch.

Make the routine practical and easy to follow.`;

  conversationHistory = [{ role: "user", content: prompt }];

  appendMessage("user", "Generate a routine with my selected products.");
  showTyping();
  setChatDisabled(true);

  try {
    const data = await callAPI(conversationHistory, true);
    const { text } = parseAPIResponse(data);
    removeTyping();
    conversationHistory.push({ role: "assistant", content: text });
    appendMessage("assistant", text);
  } catch (err) {
    removeTyping();
    appendMessage("assistant", `Sorry, I couldn't generate a routine right now. (${err.message})`);
  } finally {
    setChatDisabled(false);
    userInput.focus();
  }
});

/* ─── Chat follow-up ────────────────────────────────────────── */
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = userInput.value.trim();
  if (!text) return;

  userInput.value = "";
  appendMessage("user", text);
  showTyping();
  setChatDisabled(true);

  conversationHistory.push({ role: "user", content: text });

  try {
    const data = await callAPI(conversationHistory, true);
    const { text: reply } = parseAPIResponse(data);
    removeTyping();
    conversationHistory.push({ role: "assistant", content: reply });
    appendMessage("assistant", reply);
  } catch (err) {
    removeTyping();
    appendMessage("assistant", `Something went wrong. Please try again. (${err.message})`);
    conversationHistory.pop();
  } finally {
    setChatDisabled(false);
    userInput.focus();
  }
});

/* ─── Clear all ─────────────────────────────────────────────── */
clearAllBtn.addEventListener("click", () => {
  if (!selectedIds.size) return;
  if (!confirm("Remove all selected products?")) return;
  selectedIds.clear();
  saveSelectionToStorage();
  refreshSelectedSection();
  /* refresh visible cards */
  applyFilters();
});

/* ─── RTL toggle ────────────────────────────────────────────── */
rtlToggle.addEventListener("click", () => {
  const isRTL = document.documentElement.dir === "rtl";
  document.documentElement.dir = isRTL ? "ltr" : "rtl";
  document.documentElement.lang = isRTL ? "en" : "ar";
  rtlToggle.setAttribute("aria-pressed", String(!isRTL));
  rtlToggle.innerHTML = isRTL
    ? `<i class="fa-solid fa-language"></i> RTL`
    : `<i class="fa-solid fa-language"></i> LTR`;
});

/* ─── Filter listeners ──────────────────────────────────────── */
categoryFilter.addEventListener("change", applyFilters);
productSearch.addEventListener("input", applyFilters);

/* ─── Boot ──────────────────────────────────────────────────── */
(async function init() {
  loadSelectionFromStorage();
  await loadProducts();
  refreshSelectedSection();
})();