document.addEventListener("DOMContentLoaded", () => {
    initDashboard();
    checkAlertsBadge();
});

const getMallParam = () => {
    const mall = localStorage.getItem('mallpulse_selected_mall') || "Inorbit Mall";
    return `?mall=${encodeURIComponent(mall)}`;
};

async function initDashboard() {
    try {
        await Promise.all([
            fetchSummary(),
            fetchFloors(),
            fetchStallData()
        ]);
        // Hero is unlocked inside fetchSummary
    } catch (e) {
        showErrorState();
    }
}

function showErrorState() {
    const hero = document.getElementById("hero-card");
    hero.className = "hero-card";
    hero.style.backgroundColor = "#ddd";
    hero.innerHTML = `
        <div style="color:#333; cursor:pointer;" onclick="location.reload()">
            <h2>Couldn't load data.</h2>
            <p>Tap to retry 🔄</p>
        </div>
    `;
}

async function fetchSummary() {
    const res = await fetch("/api/summary" + getMallParam());
    if (!res.ok) throw new Error("API error");
    const data = await res.json();
    
    // update subtitle
    const selectedMall = localStorage.getItem('mallpulse_selected_mall') || "Inorbit Mall";
    document.getElementById("mall-subtitle").innerHTML = selectedMall;

    // unlock hero
    const hero = document.getElementById("hero-card");
    hero.classList.remove("skeleton-card");
    hero.querySelector('.hero-content').style.display = "flex";
    
    let emoji = data.color === "green" ? "🟢" : (data.color === "orange" ? "🟡" : "🔴");
    let heading = data.color === "green" ? "Great time to visit!" : (data.color === "orange" ? "Moderately busy" : "Very crowded");

    document.getElementById("hero-emoji").innerText = emoji;
    document.getElementById("hero-heading").innerText = heading;
    document.getElementById("hero-subtext").innerText = `${data.total_people} people across all floors right now`;
    document.getElementById("hero-time").innerText = `⏱ Avg ${data.avg_dwell_time || 20} min`;
    
    hero.classList.add(`bg-${data.color}`);
}

async function fetchFloors() {
    const res = await fetch("/api/floors" + getMallParam());
    const data = await res.json();
    
    const strip = document.getElementById("floor-strip");
    strip.innerHTML = "";
    
    data.forEach(f => {
        let emoji = f.color === "green" ? "🟢" : (f.color === "orange" ? "🟡" : "🔴");
        let html = `
            <div class="floor-card" onclick="document.getElementById('floor-group-${f.floor}').scrollIntoView({behavior: 'smooth'})">
                <div class="floor-name">Floor ${f.floor}</div>
                <div class="floor-stores">${f.stall_count} stores</div>
                <div class="floor-status text-${f.color}">${emoji} ${f.status}</div>
            </div>
        `;
        strip.innerHTML += html;
    });
}

async function fetchStallData() {
    const [stallsRes, bestRes] = await Promise.all([
        fetch("/api/stalls" + getMallParam()),
        fetch("/api/best-time" + getMallParam())
    ]);
    const stallsData = await stallsRes.json();
    const bestData = await bestRes.json();
    
    window.allStallsData = stallsData; // For wizard
    
    renderBestTime(stallsData, bestData);
    renderStallsGrid(stallsData);
}

function renderBestTime(allData, bestData) {
    const container = document.getElementById("best-time-bars");
    container.innerHTML = "";
    
    // Group totals by timeslot
    const totals = {};
    allData.forEach(d => {
        if(!totals[d.time_slot]) totals[d.time_slot] = 0;
        totals[d.time_slot] += d.population;
    });
    
    const slots = Object.keys(totals).sort();
    if(slots.length === 0) return;
    
    const maxPop = Math.max(...Object.values(totals), 1);
    const bestSlot = bestData.time_slot || slots[0];
    
    slots.forEach(slot => {
        const pop = totals[slot];
        const heightPct = Math.max((pop / maxPop) * 100, 10);
        let colClass = "safe";
        // Approximating thresholds for total (assuming 5 per stall is safe, maybe > 15*number_of_stalls)
        // We evaluate strictly based on proportional limits or static just for demo
        if(pop > 50) colClass = "busy";
        else if (pop > 20) colClass = "moderate";

        let isBest = slot === bestSlot ? "best" : "";
        
        container.innerHTML += `
            <div class="time-bar-wrapper">
                <div class="time-bar ${colClass} ${isBest}" style="height: ${heightPct}%"></div>
                ${isBest ? `<div style="font-size:10px; color:var(--green)">⭐</div>` : ''}
                <div class="time-label">${slot}</div>
            </div>
        `;
    });
    
    document.getElementById("quietest-window").innerText = `Quietest window: ${bestSlot}`;
}

function getCategoryEmoji(stallName) {
    const n = stallName.toLowerCase();
    if(n.includes("burger") || n.includes("mac") || n.includes("mcdonald") || n.includes("starbucks")) return "🍔";
    if(n.includes("nike")) return "👟";
    if(n.includes("h&m") || n.includes("zara")) return "👗";
    if(n.includes("apple") || n.includes("game")) return "📱";
    return "🛍️";
}

function getStallPillText(color) {
    if(color === "green") return "🟢 Walk right in";
    if(color === "orange") return "🟡 Short wait";
    return "🔴 Come back later";
}

function renderStallsGrid(allData) {
    // Only show current slot stalls (assume largest/last time slot is current for demo if not supplied)
    // Actually the python API returns it for the FIRST timeslot currently because it was `slots[0]`
    // Let's just figure out the time_slot dynamically to match python `slots[0]`
    if(allData.length === 0) return;
    const slots = [...new Set(allData.map(s => s.time_slot))].sort();
    const currentSlot = slots[0];
    
    const currentData = allData.filter(d => d.time_slot === currentSlot);
    
    // Group by floor
    const floorsMap = {};
    currentData.forEach(s => {
        if(!floorsMap[s.floor]) floorsMap[s.floor] = [];
        floorsMap[s.floor].push(s);
    });
    
    const container = document.getElementById("stalls-section");
    container.innerHTML = "";
    
    Object.keys(floorsMap).sort((a,b)=>a-b).forEach(f => {
        let html = `<div class="floor-group" id="floor-group-${f}">`;
        html += `<h3 class="floor-heading">Floor ${f}</h3>`;
        html += `<div class="stalls-grid">`;
        
        floorsMap[f].forEach(stall => {
            const timeEstimate = Math.max(5, Math.floor(stall.population * 1.5));
            html += `
                <div class="stall-card" onclick="location.href='/store/${stall.stall_id}'">
                    <div class="stall-header">
                        <span class="stall-name">${stall.stall_id}</span>
                        <span class="stall-cat">${getCategoryEmoji(stall.stall_id)}</span>
                    </div>
                    <div class="stall-pill bg-${stall.color}">${getStallPillText(stall.color)}</div>
                    <div class="stall-body">
                        <span>👥 ${stall.population} people</span>
                        <span>⏱ ~${timeEstimate} min</span>
                    </div>
                </div>
            `;
        });
        
        html += `</div></div>`;
        container.innerHTML += html;
    });
}

// --- PLAN MY VISIT WIZARD LOGIC ---

let wizardSelectedStores = new Set();
let wizardSelectedTime = "right_now"; // 'right_now', 'in_1_hour', 'in_2_hours', 'custom'
let wizardCustomTimeValue = "";
let currentWizardStep = 1;

document.addEventListener("DOMContentLoaded", () => {
    const fabButton = document.querySelector('.fab');
    if(fabButton) {
        fabButton.addEventListener('click', openWizard);
    }
    
    document.getElementById('wizard-close-btn').addEventListener('click', closeWizard);
    
    // Tab filtering
    document.querySelectorAll('.wizard-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            document.querySelectorAll('.wizard-tab').forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            renderWizardChips(e.target.dataset.cat);
        });
    });
    
    // Step 1 Next
    document.getElementById('wizard-next-1').addEventListener('click', () => {
        wizardGoToStep(2);
        initStep2Times();
    });
    
    // Step 2 Next
    document.getElementById('wizard-next-2').addEventListener('click', () => {
        wizardGoToStep(3);
        generateSmartPlan();
    });
    
    // Time Options Selection
    document.querySelectorAll('.time-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if(card.id === 'card-custom' && e.target.tagName === 'SELECT') return;
            document.querySelectorAll('.time-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            wizardSelectedTime = card.dataset.time;
            checkStep2Next();
        });
    });
    
    document.getElementById('wizard-time-select').addEventListener('change', (e) => {
        wizardCustomTimeValue = e.target.value;
        const customCard = document.getElementById('card-custom');
        document.querySelectorAll('.time-card').forEach(c => c.classList.remove('selected'));
        customCard.classList.add('selected');
        wizardSelectedTime = "custom";
        checkStep2Next();
    });
    
    // Save Plan
    document.getElementById('wizard-save-btn').addEventListener('click', savePlan);
});

function openWizard() {
    if(!window.allStallsData) {
        alert("Please wait for data to load...");
        return;
    }
    document.getElementById('wizard-overlay').style.display = 'flex';
    wizardGoToStep(1);
    
    // Ensure "All" tab is selected
    document.querySelectorAll('.wizard-tab').forEach(t => t.classList.remove('active'));
    document.querySelector('.wizard-tab[data-cat="all"]').classList.add('active');
    
    renderWizardChips('all');
    updateSelectedCount();
    
    // Default selection for Step 2
    document.querySelectorAll('.time-card').forEach(c => c.classList.remove('selected'));
    document.getElementById('card-right-now').classList.add('selected');
    wizardSelectedTime = "right_now";
}

function closeWizard() {
    document.getElementById('wizard-overlay').style.display = 'none';
}

function wizardGoToStep(step) {
    const isForward = step > currentWizardStep;
    currentWizardStep = step;
    document.getElementById('wizard-step-indicator').innerText = step;
    
    document.querySelectorAll('.wizard-step').forEach((el, index) => {
        el.classList.remove('active', 'slide-left');
        if (index + 1 === step) {
            el.classList.add('active');
            if (!isForward && step !== 1) {
                el.style.animation = 'slideInLeft 0.3s forwards';
            } else {
                el.style.animation = 'slideInRight 0.3s forwards';
            }
        }
    });
}

function getStoreCategory(stallName) {
    const n = stallName.toLowerCase();
    if(n.includes("food") || n.includes("burger") || n.includes("mac") || n.includes("starbucks") || n.includes("coffee") || n.includes("cafe") || n.includes("pizza") || n.includes("restaurant") || n.includes("court")) return "food";
    if(n.includes("fashion") || n.includes("clothes") || n.includes("apparel") || n.includes("h&m") || n.includes("zara") || n.includes("nike") || n.includes("adidas")) return "fashion";
    if(n.includes("electro") || n.includes("tech") || n.includes("apple") || n.includes("samsung") || n.includes("sony")) return "electronics";
    if(n.includes("entertain") || n.includes("cinema") || n.includes("movie") || n.includes("game") || n.includes("play")) return "entertainment";
    return "other";
}

function renderWizardChips(category) {
    const container = document.getElementById('wizard-store-chips');
    container.innerHTML = "";
    
    if (!window.allStallsData || window.allStallsData.length === 0) return;

    // Use current time slot to get distinct stalls
    const slots = [...new Set(window.allStallsData.map(s => s.time_slot))].sort();
    const currentSlot = slots[0];
    let stalls = window.allStallsData.filter(d => d.time_slot === currentSlot);
    
    // Category filter logic
    if (category !== 'all') {
        stalls = stalls.filter(s => getStoreCategory(s.stall_id) === category);
    }
    
    stalls.sort((a, b) => a.stall_id.localeCompare(b.stall_id)).forEach(stall => {
        const chip = document.createElement('div');
        chip.className = `store-chip ${wizardSelectedStores.has(stall.stall_id) ? 'selected' : ''}`;
        
        chip.innerHTML = `
            <div class="status-dot ${stall.color}"></div>
            ${stall.stall_id}
        `;
        
        chip.onclick = () => {
            if (wizardSelectedStores.has(stall.stall_id)) {
                wizardSelectedStores.delete(stall.stall_id);
                chip.classList.remove('selected');
            } else {
                wizardSelectedStores.add(stall.stall_id);
                chip.classList.add('selected');
            }
            updateSelectedCount();
        };
        container.appendChild(chip);
    });
}

function updateSelectedCount() {
    const count = wizardSelectedStores.size;
    const countEl = document.getElementById('wizard-selected-count');
    countEl.innerText = `${count} stores selected`;
    
    if (count > 0) {
        countEl.style.color = "var(--teal)";
        countEl.style.fontWeight = "bold";
    } else {
        countEl.style.color = "var(--text-light)";
        countEl.style.fontWeight = "500";
    }
    
    const nextBtn = document.getElementById('wizard-next-1');
    nextBtn.disabled = count === 0;
    if (count === 0) {
        nextBtn.title = "Select at least one store to continue";
        nextBtn.style.backgroundColor = "#ccc";
    } else {
        nextBtn.title = "";
        nextBtn.style.backgroundColor = "var(--teal)";
    }
}

function initStep2Times() {
    const slots = [...new Set(window.allStallsData.map(s => s.time_slot))].sort();
    
    document.querySelector('#card-right-now .time-sub').innerText = slots[0] || '';
    document.querySelector('#card-1-hour .time-sub').innerText = slots[1] || '';
    document.querySelector('#card-2-hours .time-sub').innerText = slots[2] || '';
    
    if(!slots[1]) document.getElementById('card-1-hour').style.display = 'none';
    if(!slots[2]) document.getElementById('card-2-hours').style.display = 'none';
    
    const select = document.getElementById('wizard-time-select');
    select.innerHTML = '<option value="" disabled selected>Select a time</option>';
    slots.forEach(s => {
        select.innerHTML += `<option value="${s}">${s}</option>`;
    });
    
    checkStep2Next();
}

function checkStep2Next() {
    const nextBtn = document.getElementById('wizard-next-2');
    if (wizardSelectedTime === "custom" && !wizardCustomTimeValue) {
        nextBtn.disabled = true;
    } else {
        nextBtn.disabled = false;
    }
}

function generateSmartPlan() {
    const slots = [...new Set(window.allStallsData.map(s => s.time_slot))].sort();
    let targetTimeSlot = slots[0];
    if(wizardSelectedTime === 'in_1_hour') targetTimeSlot = slots[1] || slots[0];
    if(wizardSelectedTime === 'in_2_hours') targetTimeSlot = slots[2] || slots[0];
    if(wizardSelectedTime === 'custom') targetTimeSlot = wizardCustomTimeValue;

    let planStalls = window.allStallsData.filter(d => 
        d.time_slot === targetTimeSlot && wizardSelectedStores.has(d.stall_id)
    );
    
    planStalls.sort((a,b) => a.population - b.population);
    
    const container = document.getElementById('wizard-plan-list');
    container.innerHTML = "";
    
    let totalMins = 0;
    let storesOrder = [];
    
    planStalls.forEach((stall, index) => {
        const est = Math.max(10, stall.population * 3);
        totalMins += est;
        let statusTxt = '🟢 Quick';
        if(stall.color === 'orange') statusTxt = '🟡 Moderate';
        if(stall.color === 'red') statusTxt = '🔴 Busy';
        storesOrder.push({ id: stall.stall_id, status: statusTxt });
        
        let bestSlotHtml = "";
        if(stall.color === 'red' || stall.color === 'orange') {
            const thisStallAllTimes = window.allStallsData.filter(d => d.stall_id === stall.stall_id);
            const quietest = thisStallAllTimes.reduce((min, d) => d.population < min.population ? d : min, thisStallAllTimes[0]);
            if(quietest.population < stall.population) {
                bestSlotHtml = `<div class="plan-best-slot">⏰ Best slot: ${quietest.time_slot}</div>`;
            }
        }
        
        let pillText = '🟢 Quick';
        if(stall.color === 'orange') pillText = '🟡 Moderate';
        if(stall.color === 'red') pillText = '🔴 Busy';
        
        container.innerHTML += `
            <div class="plan-item">
                <div class="plan-step-num">${index + 1}</div>
                <div class="plan-details">
                    <div class="plan-name">${stall.stall_id} — Floor ${stall.floor}</div>
                    <div class="plan-pill" style="background:var(--${stall.color})">${pillText}</div>
                    ${bestSlotHtml}
                </div>
                <div class="plan-est">${est} min</div>
            </div>
        `;
    });
    
    window.currentGeneratedPlan = {
        storesOrder: storesOrder,
        totalMins: totalMins,
        targetTimeSlot: targetTimeSlot
    };
    
    document.getElementById('wizard-plan-summary').innerText = `🕐 Total estimated visit time: ${totalMins} minutes`;
}

function savePlan() {
    if (!window.currentGeneratedPlan) return;
    
    const d = new Date();
    const formattedDate = `${d.getDate()} ${d.toLocaleString('default', {month: 'short'})} ${d.getFullYear()}, ${d.toLocaleString('default', {hour: 'numeric', minute:'2-digit'})}`;
    
    const newPlan = {
        plan_id: Date.now(),
        saved_at: formattedDate,
        stores: window.currentGeneratedPlan.storesOrder,
        visit_time: window.currentGeneratedPlan.targetTimeSlot,
        total_estimated_minutes: window.currentGeneratedPlan.totalMins
    };
    
    let plans = JSON.parse(localStorage.getItem('mallpulse_plans') || '[]');
    plans.push(newPlan);
    localStorage.setItem('mallpulse_plans', JSON.stringify(plans));
    
    const toast = document.getElementById('toast');
    toast.innerHTML = "✅ Plan saved! View it in My Alerts → Saved Plans";
    toast.onclick = () => { window.location.href = '/alerts'; };
    toast.style.cursor = "pointer";
    toast.classList.add('show');
    
    checkAlertsBadge();
    
    setTimeout(() => {
        toast.classList.remove('show');
        toast.style.cursor = "default";
        toast.onclick = null;
    }, 4000);
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
