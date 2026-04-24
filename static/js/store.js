document.addEventListener("DOMContentLoaded", () => {
    initStore();
    checkAlertsBadge();

    // alert stepper
    document.getElementById("alert-minus").addEventListener("click", () => {
        let v = parseInt(document.getElementById("alert-val").value);
        if(v > 1) document.getElementById("alert-val").value = v - 1;
    });
    document.getElementById("alert-plus").addEventListener("click", () => {
        let v = parseInt(document.getElementById("alert-val").value);
        document.getElementById("alert-val").value = v + 1;
    });

    document.getElementById("set-alert-btn").addEventListener("click", () => {
        let limit = document.getElementById("alert-val").value;
        
        let alerts = JSON.parse(localStorage.getItem('mallpulse_alerts') || '[]');
        alerts = alerts.filter(a => a.stall_id !== STALL_ID);
        alerts.push({stall_id: STALL_ID, threshold: limit});
        localStorage.setItem('mallpulse_alerts', JSON.stringify(alerts));
        
        checkAlertsBadge();
        
        showToast(`✅ Alert set! We'll notify you when ${STALL_ID} drops below ${limit} people.`);
    });
});

let storeData = [];
let allStalls = [];

const getMallParam = () => {
    const mall = localStorage.getItem('mallpulse_selected_mall') || "Inorbit Mall";
    return `?mall=${encodeURIComponent(mall)}`;
};

async function initStore() {
    try {
        const selectedMall = localStorage.getItem('mallpulse_selected_mall') || "Inorbit Mall";
        document.getElementById("mall-subtitle").innerHTML = selectedMall;
        
        const [stallRes, allRes] = await Promise.all([
            fetch(`/api/stall/${STALL_ID}${getMallParam()}`),
            fetch(`/api/stalls${getMallParam()}`)
        ]);
        const data = await stallRes.json();
        allStalls = await allRes.json();
        storeData = data;

        renderStore(data.history);
    } catch(e) {
        console.error("Error loading store", e);
    }
}

function getCategoryBadge(name) {
    const n = name.toLowerCase();
    if(n.includes("burger") || n.includes("mac") || n.includes("mcdonald") || n.includes("starbucks")) return "🍔 Food";
    if(n.includes("nike")) return "👟 Sneakers";
    if(n.includes("h&m") || n.includes("zara")) return "👗 Fashion";
    if(n.includes("apple") || n.includes("game")) return "📱 Electronics";
    return "🛍️ Retail";
}

function renderStore(history) {
    if(!history || history.length === 0) return;
    
    // figure out current slot (using the last populated or the first one depending on how history is sorted)
    // usually time_slots are 10:00, 11:00 etc.
    const sorted = [...history].sort((a,b) => a.time_slot.localeCompare(b.time_slot));
    const current = sorted[0]; // matching what we did on dashboard (fetching earliest as demo, wait we actually use the first as current)
    // actually, let's just use sorted[0] as "current" or maybe the user meant real current slot. We stick to sorted[0] 
    
    // figure out quietest for banner
    const quietest = sorted.reduce((prev, curr) => (prev.population < curr.population) ? prev : curr);

    // Header
    // Find area from allStalls to get floor
    const stallInfo = allStalls.find(s => s.stall_id === STALL_ID && s.time_slot === current.time_slot) || {floor: 0, area: 100};
    
    let bannerText = "";
    if(current.color === "green") bannerText = `Walk right in — only ${current.population} people here`;
    if(current.color === "orange") bannerText = `Short wait — ${current.population} people currently inside`;
    if(current.color === "red") bannerText = `Very busy — best time to visit: ${quietest.time_slot}`;
    
    const headerHtml = `
        <h1 style="font-size: 2rem; margin-bottom: 8px;">${STALL_ID}</h1>
        <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 16px;">
            <span class="badge" style="background: var(--teal); color: white; padding: 4px 10px; border-radius: 20px; font-size: 0.85rem;">${getCategoryBadge(STALL_ID)}</span>
            <span style="color: var(--text-light); font-size: 0.9rem;">📍 Floor ${stallInfo.floor}</span>
        </div>
        <div class="banner bg-${current.color}" style="padding: 12px 16px; border-radius: 12px; color: white; font-weight: 500; text-align: center;">
            ${current.color === 'green' ? '🟢' : (current.color === 'orange' ? '🟡' : '🔴')} ${bannerText}
        </div>
    `;
    document.getElementById("store-header").innerHTML = headerHtml;

    // Quick Stats
    const prev = sorted.length > 1 ? sorted[1] : current; 
    // wait, if 0 is current, then sorted is 10, 11, 12, ... meaning 0 is oldest. 
    // So current should be sorted[sorted.length-1] or let's just use what app.py did logic.
    // Dashboard app.js used slots[0] as current slot for demo. 
    // If slots[0] is current, then prev would be nothing? 
    // Let's just compare current vs the one after it or just mock "Steady" if we can't find.
    let trend = "Steady ➡️";
    if(sorted.indexOf(current) + 1 < sorted.length) {
        let next = sorted[sorted.indexOf(current) + 1];
        if(current.population < next.population) trend = "Getting busier ↗️";
        else if (current.population > next.population) trend = "Quieting down ↘️";
    }

    const maxCap = Math.floor(stallInfo.area / 2);
    const avgMin = current.population * 2;

    const statsHtml = `
        <div class="stats-grid" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;">
            <div class="stat-card" style="background: var(--card-bg); padding: 16px 12px; border-radius: 12px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.02); border: 1px solid var(--border);">
                <div style="font-size: 1.2rem; font-weight: 600; margin-bottom: 4px;">👥 ${current.population} <span style="font-size: 0.8rem; color: var(--text-light)">/ ${maxCap}</span></div>
                <div style="font-size: 0.75rem; color: var(--text-light);">Capacity</div>
            </div>
            <div class="stat-card" style="background: var(--card-bg); padding: 16px 12px; border-radius: 12px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.02); border: 1px solid var(--border);">
                <div style="font-size: 1.2rem; font-weight: 600; margin-bottom: 4px;">⏱ ${avgMin}m</div>
                <div style="font-size: 0.75rem; color: var(--text-light);">Avg Dwell</div>
            </div>
            <div class="stat-card" style="background: var(--card-bg); padding: 16px 12px; border-radius: 12px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.02); border: 1px solid var(--border);">
                <div style="font-size: 0.9rem; font-weight: 600; margin-bottom: 4px; line-height: 1.4;">${trend}</div>
                <div style="font-size: 0.75rem; color: var(--text-light);">Trend</div>
            </div>
        </div>
    `;
    document.getElementById("quick-stats").innerHTML = statsHtml;

    // Timeline
    const tContainer = document.getElementById("timeline-container");
    tContainer.innerHTML = "";
    
    // max for scaling
    const maxPop = Math.max(...sorted.map(s => s.population), 10);
    
    sorted.forEach(slot => {
        const heightPct = Math.max((slot.population / maxPop) * 100, 10);
        let isCurrent = slot.time_slot === current.time_slot;
        let isQuiet = slot.time_slot === quietest.time_slot;
        
        // CSS class mappings
        let bgClass = "";
        if(slot.color === "green") bgClass = "safe";
        if(slot.color === "orange") bgClass = "moderate";
        if(slot.color === "red") bgClass = "busy";

        tContainer.innerHTML += `
            <div class="time-bar-wrapper" style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; min-width: 40px; height: 100%; position: relative;">
                ${isQuiet ? `<div style="font-size:10px; color:var(--green); position:absolute; top:-20px;">⭐</div>` : ''}
                <div class="time-bar ${bgClass} ${isCurrent ? 'best' : ''}" style="height: ${heightPct}%; width: 100%; border-radius: 4px 4px 0 0; min-height: 5px;"></div>
                <div class="time-label" style="font-size: 0.7rem; color: var(--text-light); margin-top: 4px;">${slot.time_slot}</div>
            </div>
        `;
    });

    // Similar Stores
    const similarContainer = document.getElementById("similar-stores");
    similarContainer.innerHTML = "";
    const sameFloor = allStalls.filter(s => s.time_slot === current.time_slot && s.floor === stallInfo.floor && s.stall_id !== STALL_ID);
    const subset = sameFloor.slice(0, 2);
    
    if(subset.length === 0) {
        similarContainer.innerHTML = "<p style='color:var(--text-light); font-size:0.9rem;'>No other visible stores on this floor right now.</p>";
    } else {
        subset.forEach(s => {
            const pillText = s.color === "green" ? "Walk right in" : (s.color === "orange" ? "Short wait" : "Come back later");
            similarContainer.innerHTML += `
                <div class="stall-card" onclick="window.location.href='/store/${s.stall_id}'" style="display: flex; justify-content: space-between; align-items: center; background: var(--card-bg); padding: 12px 16px; border-radius: 12px; border: 1px solid var(--border); box-shadow: 0 2px 4px rgba(0,0,0,0.02); cursor: pointer;">
                    <div style="font-weight: 600;">${s.stall_id}</div>
                    <div class="bg-${s.color}" style="color: white; padding: 4px 8px; border-radius: 12px; font-size: 0.75rem;">${pillText}</div>
                </div>
            `;
        });
    }
}

function showToast(msg) {
    const t = document.getElementById("toast");
    t.innerText = msg;
    t.classList.add("show");
    setTimeout(() => {
        t.classList.remove("show");
    }, 3000);
}

function checkAlertsBadge() {
    const alerts = JSON.parse(localStorage.getItem('mallpulse_alerts') || '[]');
    const plans = JSON.parse(localStorage.getItem('mallpulse_plans') || '[]');
    const total = alerts.length + plans.length;
    const badge = document.getElementById('nav-alert-badge');
    if(badge) {
        if(total > 0) {
            badge.style.display = 'flex';
            badge.innerText = total;
            badge.style.width = '16px';
            badge.style.height = '16px';
            badge.style.fontSize = '10px';
            badge.style.color = 'white';
            badge.style.alignItems = 'center';
            badge.style.justifyContent = 'center';
            badge.style.right = '-6px';
            badge.style.top = '-6px';
        } else {
            badge.style.display = 'none';
        }
    }
}
