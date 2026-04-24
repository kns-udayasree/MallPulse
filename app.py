import os
import json
import numpy as np
import pandas as pd
import plotly.graph_objects as go
from flask import Flask, jsonify, render_template, request, redirect, make_response
#pip install flask
import plotly.io as pio
from datetime import datetime
import time as time_module
from threading import Thread

app = Flask(__name__)

DATA_FILE = "multi_floor_mall.csv"

# ── helpers ───────────────────────────────────────────────────────────────────
def crowd_status(pop):
    if pop <= 5:  return "Safe",           "green"
    if pop <= 15: return "Moderate",       "orange"
    return            "Busy! Visit Later", "red"

CITY_MAP = {
   "Inorbit Mall": "Hyderabad",
   "Phoenix Palladium": "Hyderabad",
   "Express Avenue": "Hyderabad",
   "Orion Mall": "Hyderabad",
   "South City Mall": "Hyderabad"
}

def load_data(mall_name=None):
    if not os.path.exists(DATA_FILE):
        return pd.DataFrame(columns=['mall_name', 'floor', 'time_slot', 'stall_id', 'x_coord', 'y_coord', 'stall_area', 'stall_population'])
    
    df = pd.read_csv(DATA_FILE)
    if mall_name:
        df = df[df['mall_name'] == mall_name]
    return df

# ── 2-D heatmap builder ───────────────────────────────────────────────────────
def build_floor_heatmap(df, f_id, current_slot):
    f_df = df[(df['floor'] == f_id) & (df['time_slot'] == current_slot)].copy()

    x = np.linspace(0, 100, 200)
    y = np.linspace(0, 80,  160)
    X, Y = np.meshgrid(x, y)
    Z = np.zeros_like(X, dtype=float)
    for _, row in f_df.iterrows():
        dist_sq = (X - row['x_coord'])**2 + (Y - row['y_coord'])**2
        sigma   = 8.0 + row['stall_population'] * 0.3
        Z      += row['stall_population'] * np.exp(-dist_sq / (2 * sigma**2))
    if f_df.empty:
        pass
    elif Z.max() > 0:
        Z /= Z.max()

    fig = go.Figure()
    fig.add_trace(go.Heatmap(z=Z.tolist(), x=x.tolist(), y=y.tolist(), colorscale='YlOrRd',
                             showscale=False, hoverinfo='skip', zsmooth='best'))
    fig.add_trace(go.Contour(z=Z.tolist(), x=x.tolist(), y=y.tolist(), colorscale='YlOrRd',
                             showscale=False,
                             contours=dict(start=0.05, end=0.95, size=0.1, coloring='none'),
                             line=dict(color='rgba(200,50,0,0.35)', width=1),
                             hoverinfo='skip'))

    shapes, annotations = [], []

    for _, row in f_df.iterrows():
        # people dots
        sz = np.sqrt(row['stall_area'])
        np.random.seed(int(row['x_coord'] * 100))
        n  = min(int(row['stall_population']), 30)
        px = row['x_coord'] + np.random.uniform(-sz/2.5, sz/2.5, n)
        py = row['y_coord'] + np.random.uniform(-sz/2.5, sz/2.5, n)
        fig.add_trace(go.Scatter(x=px.tolist(), y=py.tolist(), mode='markers',
                                 marker=dict(size=4, color='black', opacity=0.6),
                                 hoverinfo='skip', showlegend=False))

        x0, x1 = row['x_coord'] - sz/2, row['x_coord'] + sz/2
        y0, y1 = row['y_coord'] - sz/2, row['y_coord'] + sz/2
        status_txt, status_col = crowd_status(row['stall_population'])

        shapes.append(dict(type='rect', x0=x0, y0=y0, x1=x1, y1=y1,
                           line=dict(color='rgba(100,130,200,0.85)', width=1.5),
                           fillcolor='rgba(200,210,240,0.10)'))

        annotations.append(dict(x=(x0+x1)/2, y=y1+1.0,
                                text=f"<b>ID: {row['stall_id']}</b>",
                                showarrow=False, xanchor='center', yanchor='bottom',
                                font=dict(size=10, color='black'),
                                bgcolor='rgba(220,225,245,0.85)',
                                bordercolor='rgba(100,130,200,0.6)',
                                borderwidth=1, borderpad=2))

        icon = '🟢' if status_col=='green' else ('🟠' if status_col=='orange' else '🔴')
        annotations.append(dict(x=(x0+x1)/2, y=y0-1.0,
                                text=f"<b>{icon} {int(row['stall_population'])}<br>{status_txt}</b>",
                                showarrow=False, xanchor='center', yanchor='top',
                                font=dict(size=9, color='white'),
                                bgcolor=status_col, bordercolor=status_col,
                                borderwidth=1, borderpad=3, align='center'))

    total_pop = int(f_df['stall_population'].sum()) if not f_df.empty else 0
    max_pop = f_df['stall_population'].max() if not f_df.empty else 0
    fl_status_txt, fl_status_col = crowd_status(max_pop)
    floor_icon = '🟢' if fl_status_txt=='Safe' else ('🟠' if fl_status_txt=='Moderate' else '🔴')

    # NEW FEATURE: Calculate Estimated Shopping Time
    est_time = 15 + int(total_pop * 1.5)

    fig.update_layout(
        title=dict(
            text=(f"<b style='color:green'>FLOOR {f_id}</b><br>"
                  f"<span style='font-size:12px;color:green'>"
                  f"{floor_icon} {fl_status_txt} &nbsp;|&nbsp; 🧍 Total: {total_pop} &nbsp;|&nbsp; "
                  f"⏳ Est. Time: {est_time} mins</span>"),
            x=0.5, xanchor='center', font=dict(size=15)),
        xaxis=dict(range=[0,100], showgrid=True,
                   gridcolor='rgba(180,180,180,0.3)', dtick=20),
        yaxis=dict(range=[0,80],  showgrid=True,
                   gridcolor='rgba(180,180,180,0.3)', dtick=10,
                   scaleanchor='x', scaleratio=0.8),
        plot_bgcolor='rgba(245,248,230,0.9)',
        paper_bgcolor='white',
        width=750, height=560,
        margin=dict(l=40, r=40, t=90, b=40),
        shapes=shapes, annotations=annotations, showlegend=False
    )
    return fig

# ── API ENDPOINTS ─────────────────────────────────────────────────────────────

@app.route("/")
def landing():
    return render_template("landing.html")

@app.route("/dashboard")
def index():
    return render_template("index.html")

@app.route("/api/malls")
def api_malls():
    df = load_data()
    if df.empty:
        return jsonify([])
    
    slots = sorted(df['time_slot'].unique())
    current_slot = slots[0] if slots else None

    malls = []
    
    for mall_name in df['mall_name'].unique():
        mall_df = df[df['mall_name'] == mall_name]
        current_df = mall_df[mall_df['time_slot'] == current_slot] if current_slot else mall_df
        
        total_people = int(current_df['stall_population'].sum()) if not current_df.empty else 0
        total_floors = len(mall_df['floor'].unique()) if not mall_df.empty else 0
        total_stalls = len(mall_df['stall_id'].unique()) if not mall_df.empty else 0
        
        avg_pop = current_df['stall_population'].mean() if not current_df.empty else 0
        status_txt, status_col = crowd_status(avg_pop)
        
        if not current_df.empty:
            df_curr_floorGroup = current_df.groupby('floor')['stall_population'].sum()
            busiest_floor = int(df_curr_floorGroup.idxmax())
            quietest_store = current_df.loc[current_df['stall_population'].idxmin()]['stall_id']
        else:
            busiest_floor = 0
            quietest_store = "N/A"
            
        malls.append({
            "mall_id": mall_name.lower().replace(" ", "_"),
            "mall_name": mall_name,
            "location": CITY_MAP.get(mall_name, "Unknown"),
            "total_floors": total_floors,
            "total_stalls": total_stalls,
            "current_total_people": total_people,
            "overall_status": status_txt,
            "color": status_col,
            "busiest_floor": busiest_floor,
            "quietest_store": quietest_store
        })
    return jsonify(malls)

@app.route("/store/<stall_id>")
def store(stall_id):
    return render_template("store.html", stall_id=stall_id)

@app.route("/alerts")
def alerts():
    return render_template("alerts.html")

@app.route("/settings")
def settings():
    return render_template("settings.html")

@app.route("/admin")
def admin():
    mall_name = request.args.get('mall', 'Inorbit Mall')
    df = load_data(mall_name)
    slots = sorted(df['time_slot'].unique()) if not df.empty else []
    current_slot = slots[0] if slots else None
    floors = sorted(df['floor'].unique()) if not df.empty else []
    
    # Render 3D figure to json
    fig3d = go.Figure()
    floor_height = 25
    for f_id in floors:
        f_df = df[(df['floor']==f_id) & (df['time_slot']==current_slot)]
        z_level = f_id * floor_height
        fig3d.add_trace(go.Surface(
            z=np.full((10,10), z_level).tolist(),
            x=np.linspace(0,100,10).tolist(), y=np.linspace(0,80,10).tolist(),
            opacity=0.15, showscale=False, colorscale='Greys', hoverinfo='skip'))
        fig3d.add_trace(go.Scatter3d(
            x=f_df['x_coord'].tolist(), y=f_df['y_coord'].tolist(),
            z=[z_level+1]*len(f_df),
            mode='markers+text', text=f_df['stall_id'].tolist(),
            customdata=[[f_id]]*len(f_df),
            marker=dict(size=10, color=f_id, colorscale='Viridis', opacity=0.9),
            name=f"Floor {f_id}",
            hovertemplate="<b>%{text}</b><br>Floor %{customdata[0]}<extra></extra>"))

    fig3d.update_layout(
        #title=dict(text="🏬 <b>INORBIT MALL — 3D Overview</b>", x=0.5, xanchor='center'),
        scene=dict(xaxis_title='Width', yaxis_title='Depth', zaxis_title='Floor'),
        width=900, height=700)
    
    fig3d_json = fig3d.to_json()
    
    return render_template("admin.html", floors=floors, fig3d_json=fig3d_json)

@app.route("/api/summary")
def api_summary():
    mall_name = request.args.get('mall', 'Inorbit Mall')
    df = load_data(mall_name)
    if df.empty:
        return jsonify({"total_people": 0, "status": "Safe", "avg_dwell_time": 0})
    
    slots = sorted(df['time_slot'].unique())
    current_slot = slots[0] if slots else None
    current_df = df[df['time_slot'] == current_slot]
    
    total_pop = int(current_df['stall_population'].sum())
    # Assuming average dwell time formula applies overall
    avg_dwell = 15 + int(total_pop * 1.5)
    
    max_pop = current_df['stall_population'].max() if not current_df.empty else 0
    status_txt, status_col = crowd_status(max_pop)
    
    return jsonify({
        "total_people": total_pop,
        "status": status_txt,
        "color": status_col,
        "avg_dwell_time": avg_dwell
    })

@app.route("/api/floors")
def api_floors():
    mall_name = request.args.get('mall', 'Inorbit Mall')
    df = load_data(mall_name)
    if df.empty:
        return jsonify([])
    
    slots = sorted(df['time_slot'].unique())
    current_slot = slots[0] if slots else None
    current_df = df[df['time_slot'] == current_slot]
    
    floors = []
    for f_id in sorted(current_df['floor'].unique()):
        f_df = current_df[current_df['floor'] == f_id]
        pop = int(f_df['stall_population'].sum())
        max_pop = f_df['stall_population'].max() if not f_df.empty else 0
        status_txt, status_col = crowd_status(max_pop)
        floors.append({
            "floor": int(f_id),
            "stall_count": len(f_df),
            "total_population": pop,
            "status": status_txt,
            "color": status_col
        })
    return jsonify(floors)

@app.route("/api/stalls")
def api_stalls():
    mall_name = request.args.get('mall', 'Inorbit Mall')
    df = load_data(mall_name)
    if df.empty:
        return jsonify([])
    
    slots = sorted(df['time_slot'].unique())
    current_slot = slots[0] if slots else None
    # For stall stats in all time_slots (best for chart), maybe return all time slots
    # or just current slot data but full dataset? "all stalls with population, status, time_slot data"
    stalls = []
    for _, row in df.iterrows():
        status_txt, status_col = crowd_status(row['stall_population'])
        stalls.append({
            "stall_id": row['stall_id'],
            "floor": int(row['floor']),
            "time_slot": row['time_slot'],
            "population": int(row['stall_population']),
            "status": status_txt,
            "color": status_col,
            "area": float(row['stall_area'])
        })
    return jsonify(stalls)

@app.route("/api/stall/<stall_id>")
def api_stall_details(stall_id):
    mall_name = request.args.get('mall', 'Inorbit Mall')
    df = load_data(mall_name)
    s_df = df[df['stall_id'] == stall_id]
    if s_df.empty:
        return jsonify({"error": "Stall not found"}), 404
        
    history = []
    for _, row in s_df.iterrows():
        status_txt, status_col = crowd_status(row['stall_population'])
        history.append({
            "time_slot": row['time_slot'],
            "population": int(row['stall_population']),
            "status": status_txt,
            "color": status_col
        })
    return jsonify({"stall_id": stall_id, "history": history})

@app.route("/api/best-time")
def api_best_time():
    mall_name = request.args.get('mall', 'Inorbit Mall')
    df = load_data(mall_name)
    if df.empty:
        return jsonify({})
    
    grouped = df.groupby('time_slot')['stall_population'].sum()
    best_slot = grouped.idxmin()
    return jsonify({
        "time_slot": best_slot,
        "total_population": int(grouped.min())
    })

@app.route("/api/heatmap/<floor>")
def api_heatmap(floor):
    mall_name = request.args.get('mall', 'Inorbit Mall')
    df = load_data(mall_name)
    slots = sorted(df['time_slot'].unique())
    current_slot = slots[0] if slots else None
    try:
        f_id = int(floor)
        fig = build_floor_heatmap(df, f_id, current_slot)
        return fig.to_json()
    except Exception as e:
        return jsonify({"error": str(e)}), 400

# ── MANAGER VIEW ENDPOINTS ───────────────────────────────────────────────────────

@app.route("/manager")
def manager():
    # Check authentication
    auth_cookie = request.cookies.get('manager_authenticated')
    if auth_cookie != 'true':
        return redirect('/manager-login')
    return render_template('manager.html')

@app.route("/manager-login")
def manager_login():
    return render_template('manager_login.html')

@app.route("/api/manager/login", methods=['POST'])
def api_manager_login():
    data = request.get_json()
    password = data.get('password', '')
    
    if password == 'manager123':
        response = make_response(jsonify({"success": True, "token": "manager_authenticated"}))
        response.set_cookie('manager_authenticated', 'true', max_age=3600)  # 1 hour
        return response
    else:
        return jsonify({"success": False, "message": "Wrong password"})

def load_alerts():
    if not os.path.exists('alerts_log.json'):
        return {"alerts": []}
    with open('alerts_log.json', 'r') as f:
        return json.load(f)

def save_alerts(alerts_data):
    with open('alerts_log.json', 'w') as f:
        json.dump(alerts_data, f, indent=2)

@app.route("/api/manager/alerts")
def api_manager_alerts():
    alerts_data = load_alerts()
    alerts = alerts_data.get('alerts', [])
    
    # Apply filters
    status_filter = request.args.get('status')
    mall_filter = request.args.get('mall')
    floor_filter = request.args.get('floor')
    
    if status_filter:
        if status_filter == 'new':
            alerts = [a for a in alerts if not a.get('acknowledged', False)]
        elif status_filter == 'acknowledged':
            alerts = [a for a in alerts if a.get('acknowledged', False) and not a.get('resolved', False)]
        elif status_filter == 'resolved':
            alerts = [a for a in alerts if a.get('resolved', False)]
    
    if mall_filter:
        alerts = [a for a in alerts if a.get('mall_name') == mall_filter]
    
    if floor_filter:
        alerts = [a for a in alerts if str(a.get('floor')) == str(floor_filter)]
    
    # Sort by sent_at descending
    alerts.sort(key=lambda x: x.get('sent_at', ''), reverse=True)
    
    return jsonify(alerts)

@app.route("/api/manager/notify", methods=['POST'])
def api_manager_notify():
    data = request.get_json()
    
    # Calculate severity based on population
    population = int(data.get('population', 0))
    if population <= 15:
        severity = "Warning"
    elif population <= 25:
        severity = "Critical"
    else:
        severity = "Stampede Risk"
    
    # Create new alert
    alert_id = str(int(time_module.time()))
    current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    new_alert = {
        "alert_id": alert_id,
        "mall_name": data.get('mall_name', 'Inorbit Mall'),
        "floor": int(data.get('floor', 0)),
        "stall_id": data.get('stall_id', 'Unknown'),
        "population": population,
        "severity": severity,
        "admin_message": data.get('admin_message', ''),
        "sent_by": "Admin",
        "sent_at": current_time,
        "acknowledged": False,
        "acknowledged_at": None,
        "response_time_minutes": None,
        "resolved": False,
        "resolved_at": None
    }
    
    # Load and update alerts
    alerts_data = load_alerts()
    alerts = alerts_data.get('alerts', [])
    alerts.append(new_alert)
    
    # Keep maximum 50 alerts
    if len(alerts) > 50:
        alerts = alerts[-50:]  # Keep the most recent 50
    
    alerts_data['alerts'] = alerts
    save_alerts(alerts_data)
    
    return jsonify({"success": True, "alert_id": alert_id})

@app.route("/api/manager/acknowledge/<alert_id>", methods=['POST'])
def api_manager_acknowledge(alert_id):
    alerts_data = load_alerts()
    alerts = alerts_data.get('alerts', [])
    
    for alert in alerts:
        if alert.get('alert_id') == alert_id:
            alert['acknowledged'] = True
            alert['acknowledged_at'] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            
            # Calculate response time
            sent_at = datetime.strptime(alert['sent_at'], "%Y-%m-%d %H:%M:%S")
            acknowledged_at = datetime.strptime(alert['acknowledged_at'], "%Y-%m-%d %H:%M:%S")
            response_time = (acknowledged_at - sent_at).total_seconds() / 60
            alert['response_time_minutes'] = round(response_time, 1)
            
            alerts_data['alerts'] = alerts
            save_alerts(alerts_data)
            
            return jsonify({"success": True, "response_time": alert['response_time_minutes']})
    
    return jsonify({"success": False, "message": "Alert not found"}), 404

@app.route("/api/manager/resolve/<alert_id>", methods=['POST'])
def api_manager_resolve(alert_id):
    alerts_data = load_alerts()
    alerts = alerts_data.get('alerts', [])
    
    for alert in alerts:
        if alert.get('alert_id') == alert_id:
            alert['resolved'] = True
            alert['resolved_at'] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            
            alerts_data['alerts'] = alerts
            save_alerts(alerts_data)
            
            return jsonify({"success": True})
    
    return jsonify({"success": False, "message": "Alert not found"}), 404

@app.route("/api/manager/stats")
def api_manager_stats():
    alerts_data = load_alerts()
    alerts = alerts_data.get('alerts', [])
    
    today = datetime.now().strftime("%Y-%m-%d")
    today_alerts = [a for a in alerts if a.get('sent_at', '').startswith(today)]
    
    pending_ack = [a for a in alerts if not a.get('acknowledged', False) and not a.get('resolved', False)]
    acknowledged = [a for a in alerts if a.get('acknowledged', False) and not a.get('resolved', False)]
    resolved = [a for a in alerts if a.get('resolved', False)]
    
    # Calculate average response time
    response_times = [a.get('response_time_minutes', 0) for a in alerts if a.get('response_time_minutes') is not None]
    avg_response_time = sum(response_times) / len(response_times) if response_times else 0
    
    # Find most crowded stall and floor
    if alerts:
        most_crowded_stall = max(alerts, key=lambda x: x.get('population', 0)).get('stall_id', 'Unknown')
        most_crowded_floor = max(alerts, key=lambda x: x.get('population', 0)).get('floor', 0)
    else:
        most_crowded_stall = 'Unknown'
        most_crowded_floor = 0
    
    return jsonify({
        "total_alerts_today": len(today_alerts),
        "pending_acknowledgement": len(pending_ack),
        "acknowledged": len(acknowledged),
        "resolved": len(resolved),
        "avg_response_time_minutes": round(avg_response_time, 1),
        "most_crowded_stall": most_crowded_stall,
        "most_crowded_floor": most_crowded_floor
    })

@app.route("/api/manager/floor-info")
def api_manager_floor_info():
    mall = request.args.get('mall')
    floor = request.args.get('floor')
    
    if not mall or floor is None:
        return jsonify({"error": "mall and floor parameters required"}), 400
    
    try:
        with open('stall_owners.json', 'r') as f:
            stall_owners = json.load(f)
        
        if mall in stall_owners and floor in stall_owners[mall].get('floor_managers', {}):
            return jsonify(stall_owners[mall]['floor_managers'][floor])
        else:
            return jsonify({"error": "Floor manager not found"}), 404
    except FileNotFoundError:
        return jsonify({"error": "stall_owners.json not found"}), 404

def auto_alert_checker():
    while True:
        time_module.sleep(60)  # Check every 60 seconds
        try:
            df = load_data()
            if df.empty:
                continue
                
            latest_slot = df['time_slot'].max()
            latest_df = df[df['time_slot'] == latest_slot]
            
            alerts_data = load_alerts()
            existing_alerts = alerts_data.get('alerts', [])
            
            for _, row in latest_df.iterrows():
                if row['stall_population'] > 35:  # Auto-create stampede risk alert
                    # Check if there's already an unresolved alert for this stall
                    existing_unresolved = [
                        a for a in existing_alerts 
                        if (a.get('stall_id') == row['stall_id'] and 
                            a.get('mall_name') == row['mall_name'] and
                            a.get('floor') == row['floor'] and
                            not a.get('resolved', False))
                    ]
                    
                    if not existing_unresolved:
                        # Create auto alert
                        alert_id = str(int(time_module.time()))
                        current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                        
                        auto_alert = {
                            "alert_id": alert_id,
                            "mall_name": row['mall_name'],
                            "floor": int(row['floor']),
                            "stall_id": row['stall_id'],
                            "population": int(row['stall_population']),
                            "severity": "Stampede Risk",
                            "admin_message": "Auto-generated alert: High crowd density detected",
                            "sent_by": "System",
                            "sent_at": current_time,
                            "acknowledged": False,
                            "acknowledged_at": None,
                            "response_time_minutes": None,
                            "resolved": False,
                            "resolved_at": None
                        }
                        
                        existing_alerts.append(auto_alert)
                        
                        # Keep maximum 50 alerts
                        if len(existing_alerts) > 50:
                            existing_alerts = existing_alerts[-50:]
                        
                        alerts_data['alerts'] = existing_alerts
                        save_alerts(alerts_data)
                        
        except Exception as e:
            # Log error but continue running
            print(f"Auto alert checker error: {e}")
            pass

# Start background thread
checker_thread = Thread(target=auto_alert_checker, daemon=True)
checker_thread.start()

if __name__ == "__main__":
    app.run(debug=True, port=5000)
