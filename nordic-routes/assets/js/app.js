// ====== ROUTE DATA (loaded from JSON) ======
let ROUTES = [];
let ROUTES_BY_REGION = {};

// Utility
function capitalize(s){ return (s || "").replace(/\b\w/g, m => m.toUpperCase()); }

// Build days using optionalDays to extend
function buildDays(route, desired) {
  const base = Array.isArray(route.days) ? route.days.slice(0) : [];
  if (desired > base.length) {
    const extras = Array.isArray(route.optionalDays) ? route.optionalDays : [];
    let i = 0;
    while (base.length < desired) {
      base.push(extras[i % Math.max(extras.length, 1)] || {
        title: `Extra Day ${base.length + 1}`,
        morning: "Leisure morning",
        afternoon: "Optional excursion",
        evening: "Relaxed dinner"
      });
      i++;
    }
  }
  return base.slice(0, desired);
}

// Apply dynamic length behavior based on selected route
function applyLengthBehavior(selectedRouteId) {
  const lengthField = document.getElementById('length-field');
  const lengthInput = document.getElementById('length');
  const help = document.getElementById('length-help');

  // Reset UI
  help.hidden = true;
  lengthInput.disabled = false;
  lengthField.style.display = '';
  lengthInput.removeAttribute('min');
  lengthInput.removeAttribute('max');
  lengthInput.placeholder = '5';
  if (!selectedRouteId) return;

  const route = ROUTES.find(r => r.id === selectedRouteId);
  if (!route) return;

  // Fixed-length route
  if (typeof route.length === 'number') {
    lengthInput.value = route.length;
    lengthInput.disabled = true;
    help.textContent = `This route is ${route.length} days by design. You can add buffer days later.`;
    help.hidden = false;
    return;
  }

  // Flexible route with min/max
  if (typeof route.minDays === 'number' && typeof route.maxDays === 'number') {
    lengthInput.disabled = false;
    lengthInput.min = String(route.minDays);
    lengthInput.max = String(route.maxDays);
    lengthInput.value = route.minDays;
    lengthInput.placeholder = route.minDays;
    help.textContent = `Choose between ${route.minDays} and ${route.maxDays} days for this route.`;
    help.hidden = false;
  }
}

// Populate the Route dropdown when a region is chosen
function populateRouteSelect(regionValue) {
  const routeSelect = document.getElementById('route');
  const routeHelp = document.getElementById('route-help');
  const regionKey = (regionValue || '').toLowerCase();
  const list = ROUTES_BY_REGION[regionKey] || [];

  // Reset
  routeSelect.innerHTML = '';
  routeSelect.disabled = true;
  routeHelp.hidden = true;
  delete routeSelect.dataset.autoroute;

  if (list.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No route available';
    routeSelect.appendChild(opt);
    applyLengthBehavior('');
    return;
  }

  if (list.length === 1) {
    // Auto-select the single route (keep dropdown disabled)
    routeSelect.dataset.autoroute = list[0].id;
    const opt = document.createElement('option');
    opt.value = list[0].id;
    opt.textContent = list[0].name + ' (auto-selected)';
    routeSelect.appendChild(opt);
    applyLengthBehavior(list[0].id);
    return;
  }

  // Multiple routes — enable select
  const def = document.createElement('option');
  def.value = '';
  def.disabled = true;
  def.selected = true;
  def.textContent = 'Choose a route';
  routeSelect.appendChild(def);

  list.forEach(r => {
    const opt = document.createElement('option');
    opt.value = r.id;
    opt.textContent = r.name;
    routeSelect.appendChild(opt);
  });

  routeSelect.disabled = false;
  routeHelp.hidden = false;
  applyLengthBehavior(''); // clear length behavior until user picks a route
}

// Build final itinerary based on route selection + length rules
function fakeBuildItinerary(values) {
  const routeId = values.route || '';
  const budget = values.budget || 'mid';
  const selected = ROUTES.find(r => r.id === routeId);

  if (selected) {
    let finalLength;
    if (typeof selected.length === 'number') {
      finalLength = selected.length; // fixed
    } else {
      const min = selected.minDays || 2;
      const max = selected.maxDays || Math.max(min, 14);
      const requested = Number(values.length || min);
      finalLength = Math.max(min, Math.min(max, requested));
    }

    const nightly = budget === 'budget' ? 90 : budget === 'mid' ? 150 : 260;
    const activity = budget === 'budget' ? 40 : budget === 'mid' ? 80 : 140;
    const estimate = Math.round(finalLength * (nightly + activity));

    return {
      region: selected.region,
      length: finalLength,
      focus: [],
      budget,
      estimate,
      currency: '€',
      days: buildDays(selected, finalLength),
      affiliates: { hotel: '#', activity: '#', transport: '#' }
    };
  }

  // Fallback generic plan
  const length = Math.max(2, Math.min(14, Number(values.length || 3)));
  return {
    region: values.region || 'Norway',
    length,
    focus: [],
    budget,
    estimate: 150 * length,
    currency: '€',
    days: Array.from({ length }, (_, i) => ({
      title: `Day ${i + 1}`,
      morning: 'Scenic viewpoint / easy hike',
      afternoon: 'Local signature activity',
      evening: 'Local dining & rest'
    })),
    affiliates: { hotel: '#', activity: '#', transport: '#' }
  };
}

// ====== DOM wiring ======
document.addEventListener("DOMContentLoaded", () => {
  // Fetch DB (requires running from a local server)
  fetch('assets/data/content-db.json')
    .then(r => r.json())
    .then(json => {
      ROUTES = Array.isArray(json.routes) ? json.routes : [];
      ROUTES_BY_REGION = ROUTES.reduce((acc, r) => {
        const key = (r.region || 'Other').toLowerCase();
        (acc[key] = acc[key] || []).push(r);
        return acc;
      }, {});
    })
    .catch(err => console.error('Failed to load content-db.json', err));

  const form = document.getElementById("builder-form");
  const resultEmpty = document.getElementById("result-empty");
  const resultLoading = document.getElementById("result-loading");
  const resultWrap = document.getElementById("result");

  const outLen = document.getElementById("result-length");
  const outRegion = document.getElementById("result-region");
  const outFocus = document.getElementById("result-focus");
  const outBudget = document.getElementById("result-budget");
  const outCurrency = document.getElementById("result-currency");
  const outEstimate = document.getElementById("result-estimate");
  const daysEl = document.getElementById("days");

  const ctaHotels = document.getElementById("cta-hotels");
  const ctaActivities = document.getElementById("cta-activities");
  const ctaTransport = document.getElementById("cta-transport");

  // Region → populate routes
  const regionEl = document.getElementById("region");
  const routeEl = document.getElementById("route");

  regionEl.addEventListener('change', (e) => {
    // retry if JSON hasn't finished loading yet
    const tryPopulate = () => {
      if (ROUTES.length === 0) {
        setTimeout(tryPopulate, 100);
      } else {
        populateRouteSelect(e.target.value);
      }
    };
    tryPopulate();
  });

  // Route → adjust length behavior
  routeEl.addEventListener('change', (e) => applyLengthBehavior(e.target.value));

  // Submit → build itinerary
  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const values = {
      region: document.getElementById("region").value,
      route: document.getElementById("route").value || document.getElementById("route").dataset.autoroute || '',
      length: document.getElementById("length").value,
      budget: document.getElementById("budget").value,
      pace: document.getElementById("pace").value,
      interests: document.getElementById("interests").value,
      notes: document.getElementById("notes").value,
    };

    // UI: loading state
    resultEmpty.hidden = true;
    resultWrap.hidden = true;
    resultLoading.hidden = false;

    setTimeout(() => {
      const data = fakeBuildItinerary(values);

      // Summary
      outLen.textContent = String(data.length);
      outRegion.textContent = data.region;
      outFocus.textContent = data.focus.length ? data.focus.join(", ") : "—";
      outBudget.textContent = data.budget;
      outCurrency.textContent = data.currency;
      outEstimate.textContent = String(data.estimate);

      // Days
      daysEl.innerHTML = "";
      data.days.forEach((d) => {
        const div = document.createElement("div");
        div.className = "day-card";
        div.innerHTML = `
          <div class="day-title"><strong>${d.title}</strong></div>
          <ul>
            <li><strong>Morning:</strong> ${d.morning}</li>
            <li><strong>Afternoon:</strong> ${d.afternoon}</li>
            <li><strong>Evening:</strong> ${d.evening}</li>
          </ul>
        `;
        daysEl.appendChild(div);
      });

      // CTAs (replace with affiliates later)
      ctaHotels.href = '#';
      ctaActivities.href = '#';
      ctaTransport.href = '#';

      // Show result
      resultLoading.hidden = true;
      resultWrap.hidden = false;
    }, 600);
  });
});
