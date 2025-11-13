
  const form = document.getElementById('productForm');
  const productList = document.getElementById('productList');
  const farmerIdInput = document.getElementById('farmer_id');

  // AI Farm Insights elements
  const insightsSection = document.getElementById('aiInsightsSection');
  const insightsSummaryEl = document.getElementById('aiInsightsSummary');
  const insightsActionsEl = document.getElementById('aiInsightsActions');
  const insightsRefreshBtn = document.getElementById('aiInsightsRefresh');
  const insightsStatusEl = document.getElementById('aiInsightsStatus');

  let products = [];

  const defaultFarmerId = 1;
//   fetchFarmerProducts(defaultFarmerId);

  form.addEventListener('submit', function(e) {
    e.preventDefault();

    const product = {
      name: document.getElementById('name').value,
      type: document.getElementById('type').value,
      quantity: document.getElementById('quantity').value,
      unit: document.getElementById('unit').value,
      price_per_unit: document.getElementById('price_per_unit').value,
      image_url: document.getElementById('image_url').value,
      farmer_id: farmerIdInput.value,
    };
    console.log(product);
    // Send product to backend (optional placeholder, adjust with your API)
    fetch('http://localhost:3000/add-product', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(product)
    })
    .then(res => res.json())
    .then(() => {
      fetchFarmerProducts(product.farmer_id); // Refresh product list
      form.reset();
    })
    .catch(err => console.error('Error adding product:', err));
  });

  function fetchFarmerProducts(farmerId) {
    fetch(`http://localhost:3000/farmer-products/${farmerId}`)
      .then(response => response.json())
      .then(data => {
        products = data;
        console.log(products);
        renderProducts();
      })
      .catch(error => console.error('Error fetching farmer products:', error));
  }

  function renderProducts() {
    productList.innerHTML = '';
    products.forEach(prod => {
      const card = document.createElement('div');
      card.className = 'product-card';
      card.innerHTML = `
        <h4>${prod.name}</h4>
        <p>Type: ${prod.type}</p>
        <p>Quantity: ${prod.quantity} ${prod.unit}</p>
        <p>Price: ₹${prod.price_per_unit} / ${prod.unit}</p>
        <p><strong>Farmer ID:</strong> ${prod.farmer_id}</p>
      `;
      productList.appendChild(card);
    });
  }

  async function fetchAiInsights(farmerId) {
    if (!insightsSection || !insightsRefreshBtn) return;

    const effectiveFarmerId = farmerId || farmerIdInput?.value || defaultFarmerId;

    insightsRefreshBtn.disabled = true;
    insightsRefreshBtn.textContent = 'Generating...';
    if (insightsStatusEl) {
      insightsStatusEl.textContent = 'Asking GreenBuddy for insights...';
    }

    try {
      const res = await fetch('http://localhost:3000/ai/farm-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ farmer_id: effectiveFarmerId })
      });

      const data = await res.json();
      if (!res.ok) {
        const msg = data.error || 'Failed to load AI farm insights.';
        throw new Error(msg);
      }

      if (insightsSummaryEl) {
        insightsSummaryEl.textContent = data.summary || 'No insights available at the moment.';
      }

      if (insightsActionsEl) {
        insightsActionsEl.innerHTML = '';
        if (Array.isArray(data.actions) && data.actions.length > 0) {
          data.actions.forEach(action => {
            const li = document.createElement('li');
            li.textContent = action;
            insightsActionsEl.appendChild(li);
          });
        }
      }

      if (insightsStatusEl) {
        insightsStatusEl.textContent = 'Insights updated.';
      }
    } catch (err) {
      console.error('Error fetching AI farm insights:', err);
      if (insightsStatusEl) {
        insightsStatusEl.textContent = 'Sorry, AI insights are temporarily unavailable.';
      }
    } finally {
      if (insightsRefreshBtn) {
        insightsRefreshBtn.disabled = false;
        insightsRefreshBtn.textContent = 'Generate insights';
      }
    }
  }

  if (insightsRefreshBtn) {
    insightsRefreshBtn.addEventListener('click', function () {
      const idFromInput = farmerIdInput?.value || defaultFarmerId;
      fetchAiInsights(idFromInput);
    });
  }

  fetchFarmerProducts(defaultFarmerId);
  // Automatically load insights for the default farmer on page load
  fetchAiInsights(defaultFarmerId);
