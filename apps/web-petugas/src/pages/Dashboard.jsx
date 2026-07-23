import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { getAllPickups, updatePickupStatus } from "../services/pickupService";
import { updateStatus } from "../services/authService";
import api from "../services/api";
import {
  Recycle, Bell, Wallet, MapPin, CheckCircle2, Truck,
  ClipboardList, ChevronRight, Play, Scale, History,
  ShoppingBag, MessageCircle, Package, Leaf, X, LogOut, User, ArrowRight,
  Star, BarChart2
} from "lucide-react";


/* ── Harga per kg (tidak diubah) ── */
const HARGA = {
  plastik: 2000, kertas: 1500, logam: 5000,
  kaca: 1000, elektronik: 10000, organik: 500, besi: 5000,
  "botol plastik": 2000, kardus: 1000, "buku/hps": 1500
};

/* ── Ikon per jenis sampah ── */
const WASTE_EMOJI = {
  plastik: "♻️", kertas: "📄", logam: "🔩",
  kaca: "🔵", elektronik: "💻", organik: "🌿",
  besi: "⚙️", kardus: "📦", default: "🗑️"
};

/* ── Global Audio Object ── */
const notifAudio = new Audio("https://actions.google.com/sounds/v1/alarms/beep_short.ogg");
notifAudio.preload = "auto";

function Dashboard() {
  const [pickups, setPickups] = useState([]);
  const [walletBalance, setWalletBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [availability, setAvailability] = useState("OFFLINE");
  const [statusLoading, setStatusLoading] = useState(false);

  /* Sidebar Drawer state */
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarClosing, setIsSidebarClosing] = useState(false);

  /* Notifikasi popup state */
  const [showNotifPopup, setShowNotifPopup] = useState(false);
  const [notifOrder, setNotifOrder] = useState(null);
  const [countdown, setCountdown] = useState(30);
  const [seenOrderIds, setSeenOrderIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem("seenOrderIds") || "[]"); }
    catch { return []; }
  });
  const [accepting, setAccepting] = useState(false);
  const [activeTab, setActiveTab] = useState("pesanan");

  const navigate = useNavigate();
  const countdownRef = useRef(null);
  const isNotifActiveRef = useRef(false);

  /* Unlock audio pada interaksi pertama */
  useEffect(() => {
    const unlockAudio = () => {
      notifAudio.play().then(() => {
        notifAudio.pause();
        notifAudio.currentTime = 0;
      }).catch(e => console.log("Unlock audio gagal:", e));

      // Unlock Speech Synthesis
      if ("speechSynthesis" in window) {
        const silentMsg = new SpeechSynthesisUtterance("");
        silentMsg.volume = 0;
        window.speechSynthesis.speak(silentMsg);
      }

      document.removeEventListener("click", unlockAudio);
      document.removeEventListener("touchstart", unlockAudio);
    };
    document.addEventListener("click", unlockAudio);
    document.addEventListener("touchstart", unlockAudio);
    return () => {
      document.removeEventListener("click", unlockAudio);
      document.removeEventListener("touchstart", unlockAudio);
    };
  }, []);

  /* ── Fetch dashboard data (tidak diubah) ── */
  const fetchDashboardData = useCallback(async () => {
    try {
      const [resPickups, resWallet, profileRes] = await Promise.all([
        getAllPickups(),
        api.get("/wallet").catch(() => ({ data: { balance: 0 } })),
        api.get("/auth/profile").catch(() => ({ data: { user: {} } }))
      ]);
      const allPickups = resPickups.data || [];
      setPickups(allPickups);
      setWalletBalance(Number(resWallet.data.balance) || 0);

      const av = profileRes.data?.user?.availability_status || localStorage.getItem("availability_status") || "OFFLINE";
      setAvailability(av);

      /* Cek order pending baru untuk popup notifikasi */
      const pendingOrders = allPickups.filter(p => p.status === "pending");
      const newPending = pendingOrders.find(p => !seenOrderIds.includes(p.id));
      if (newPending && !showNotifPopup) {
        setNotifOrder(newPending);
        setShowNotifPopup(true);
        setCountdown(30);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [seenOrderIds, showNotifPopup]);

  useEffect(() => { fetchDashboardData(); }, []);

  /* Polling setiap 20 detik untuk order baru */
  useEffect(() => {
    const interval = setInterval(fetchDashboardData, 20000);
    return () => clearInterval(interval);
  }, [fetchDashboardData]);

  /* Countdown timer untuk popup notifikasi */
  useEffect(() => {
    if (showNotifPopup && countdown > 0) {
      countdownRef.current = setTimeout(() => setCountdown(c => c - 1), 1000);
    } else if (showNotifPopup && countdown === 0) {
      dismissNotif();
    }
    return () => clearTimeout(countdownRef.current);
  }, [showNotifPopup, countdown]);

  /* Play sound when popup shows */
  useEffect(() => {
    let intervalId;

    if (showNotifPopup) {
      const playNotification = () => {
        // 1. Putar suara Ting Ting
        notifAudio.currentTime = 0;
        notifAudio.volume = 1.0;
        notifAudio.play().catch(e => console.log("Auto-play blocked:", e));

        // 2. Putar Suara Asisten (Text-to-Speech)
        if ("speechSynthesis" in window) {
          // Catatan: JANGAN memanggil window.speechSynthesis.cancel() di sini 
          // sebelum speak(), karena di Chrome sering menyebabkan suara jadi bisu (silent failure bug).
          const msg = new SpeechSynthesisUtterance("Order penjemputan sampah baru telah masuk. Silakan periksa pesanan Anda.");
          msg.lang = "id-ID"; // Bahasa Indonesia
          msg.rate = 0.9;     // Sedikit lebih lambat
          msg.pitch = 1.1;    // Sedikit lebih tinggi
          msg.volume = 1.0;   // Volume penuh
          window.speechSynthesis.speak(msg);
        }
      };

      // Jalankan langsung pertama kali
      playNotification();

      // Ulangi terus setiap 7 detik selama popup terbuka
      intervalId = setInterval(() => {
        playNotification();
      }, 7000);

    } else {
      // Matikan semua suara jika popup ditutup
      notifAudio.pause();
      notifAudio.currentTime = 0;
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      if (intervalId) clearInterval(intervalId);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [showNotifPopup]);

  /* ── Tutup popup notifikasi ── */
  const dismissNotif = () => {
    if (notifOrder) {
      const updated = [...seenOrderIds, notifOrder.id];
      setSeenOrderIds(updated);
      localStorage.setItem("seenOrderIds", JSON.stringify(updated));
    }
    setShowNotifPopup(false);
    setNotifOrder(null);
    clearTimeout(countdownRef.current);
  };

  /* ── Terima order dari popup (logika tetap sama) ── */
  const handleTerimaFromNotif = async () => {
    if (!notifOrder) return;
    setAccepting(true);
    try {
      const { acceptPickup } = await import("../services/pickupService");
      await acceptPickup(notifOrder.id);
      dismissNotif();
      fetchDashboardData();
      navigate(`/orders/${notifOrder.id}`);
    } catch (err) {
      console.error(err);
    } finally {
      setAccepting(false);
    }
  };

  /* ── Toggle status ONLINE/OFFLINE ── */
  const handleToggleStatus = async () => {
    // === UNLOCK AUDIO SECARA EKSPLISIT ===
    // Karena ini dipanggil langsung dari klik pengguna, browser pasti mengizinkannya!
    notifAudio.play().then(() => {
      notifAudio.pause();
      notifAudio.currentTime = 0;
    }).catch(e => console.log("Unlock audio gagal:", e));
    
    if ("speechSynthesis" in window) {
      const silentMsg = new SpeechSynthesisUtterance("");
      silentMsg.volume = 0;
      window.speechSynthesis.speak(silentMsg);
    }
    // =====================================

    const newStatus = (availability === "AVAILABLE" || availability === "BUSY") ? "OFFLINE" : "AVAILABLE";

    setStatusLoading(true);
    try {
      if (newStatus === "AVAILABLE") {
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            async (pos) => {
              try {
                const { latitude, longitude } = pos.coords;
                await updateStatus({ availability_status: newStatus, latitude, longitude });
                setAvailability(newStatus);
                localStorage.setItem("availability_status", newStatus);
              } catch (err) {
                console.error(err);
                alert("Gagal mengupdate status ke server.");
              } finally {
                setStatusLoading(false);
              }
            },
            (error) => {
              console.error(`Geolocation error [Code: ${error.code}]: ${error.message}`);
              alert("Gagal mendapatkan lokasi. Pastikan izin lokasi (GPS) diaktifkan di browser/HP Anda.");
              setStatusLoading(false);
            },
            { timeout: 10000, enableHighAccuracy: true }
          );
          return;
        } else {
          alert("Browser Anda tidak mendukung fitur lokasi GPS.");
        }
      } else {
        await updateStatus({ availability_status: newStatus });
        setAvailability(newStatus);
        localStorage.setItem("availability_status", newStatus);
      }
    } catch (err) {
      console.error(err);
      alert("Terjadi kesalahan sistem saat mengubah status.");
    } finally {
      // If we didn't return early (for Geolocation), we clear loading here
      if (newStatus !== "AVAILABLE") {
        setStatusLoading(false);
      }
    }
  };

  /* Sidebar Actions */
  const closeSidebar = () => {
    setIsSidebarClosing(true);
    setTimeout(() => {
      setIsSidebarOpen(false);
      setIsSidebarClosing(false);
    }, 300);
  };

  /* ── Compute stats ── */
  const today = new Date().toDateString();
  const todayPickups = pickups.filter(p => new Date(p.created_at).toDateString() === today);
  // Sembunyikan order pending yang sudah ditolak (ada di seenOrderIds) dari daftar
  const pending = pickups.filter(p => p.status === "pending" && !seenOrderIds.includes(p.id));
  const activePickups = pickups.filter(p => ["accepted", "on_the_way"].includes(p.status));
  const todayCompleted = todayPickups.filter(p => p.status === "completed");

  const currentOrder = activePickups.length > 0 ? activePickups[0] : null;
  const currentHarga = currentOrder ? HARGA[currentOrder.waste_type?.toLowerCase()] || 1000 : 0;
  const estPrice = currentOrder ? (currentOrder.estimated_weight * currentHarga) + parseFloat(currentOrder.pickup_fee || 0) : 0;

  const pendapatanHariIni = todayCompleted.reduce((sum, p) => {
    const h = HARGA[p.waste_type?.toLowerCase()] || 1000;
    const trashValue = parseFloat(p.actual_weight || 0) * h;
    const argo = parseFloat(p.pickup_fee || 0);
    return sum + trashValue + argo;
  }, 0);

  const beratHariIni = todayCompleted.reduce((s, p) => s + (parseFloat(p.actual_weight) || 0), 0);

  /* ── Mulai jemput ── */
  const handleMulaiJemput = async () => {
    if (!currentOrder) return;
    try {
      await updatePickupStatus(currentOrder.id, "on_the_way");
      fetchDashboardData();
    } catch (err) { console.error(err); }
  };

  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const firstName = user.name ? user.name.split(" ")[0] : "Petugas";
  const initials = user.name
    ? user.name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase()
    : "P";

  const isOnline = availability === "AVAILABLE" || availability === "BUSY";
  const statusLabel = isOnline ? "ONLINE" : "OFFLINE";
  const statusClass = isOnline ? "online" : "offline";
  const statusColor = isOnline ? "var(--success)" : "var(--text-light)";

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", fontWeight: 500 }}>Memuat dashboard...</p>
      </div>
    );
  }

  return (
    <>
      {/* ══════════════════════════════════════════
          SIDEBAR DRAWER (OVERLAY & PANEL)
          ══════════════════════════════════════════ */}
      {isSidebarOpen && (
        <div className={`drawer-overlay ${isSidebarClosing ? "closing" : ""}`} onClick={closeSidebar}>
          <div className={`drawer-panel ${isSidebarClosing ? "closing" : ""}`} onClick={e => e.stopPropagation()}>

            {/* ── PROFILE SECTION (Gojek Style) ── */}
            <div className="gd-profile-section">
              {/* Avatar besar di tengah */}
              <div className="gd-avatar-wrap">
                {user.profile_photo ? (
                  <img src={user.profile_photo} alt="Foto Profil" className="gd-avatar-img" />
                ) : (
                  <div className="gd-avatar-initial">{initials}</div>
                )}
              </div>

              {/* Nama kapital */}
              <h2 className="gd-user-name">{(user.name || "PETUGAS").toUpperCase()}</h2>
              <p className="gd-user-sub">{user.phone || user.email || "Petugas Bank Sampah"}</p>

              {/* Saldo mini */}
              <div
                className="gd-balance-chip"
                onClick={() => { closeSidebar(); navigate("/tarik-saldo"); }}
              >
                <Wallet size={13} />
                <span>Saldo: Rp {walletBalance.toLocaleString("id-ID")}</span>
                <ChevronRight size={13} />
              </div>

              {/* Close button */}
              <button className="gd-close-btn" onClick={closeSidebar} aria-label="Tutup">
                <X size={18} />
              </button>
            </div>

            {/* ── MENU LIST (Gojek Style) ── */}
            <div className="gd-menu-list">

              {/* Status Kerja — dengan toggle */}
              <div className="gd-menu-row gd-menu-row--toggle">
                <span className="gd-menu-label">Status Kerja</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{
                    fontSize: "0.7rem", fontWeight: 700,
                    color: isOnline ? "#16a34a" : "#9ca3af"
                  }}>
                    {statusLabel}
                  </span>
                  <label className="toggle-switch" style={{ transform: "scale(0.85)" }}>
                    <input
                      type="checkbox"
                      checked={isOnline}
                      onChange={handleToggleStatus}
                      disabled={statusLoading}
                      aria-label="Toggle status kerja"
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>
              </div>

              <div className="gd-divider" />

              {/* Order Masuk */}
              <button className="gd-menu-row" onClick={() => { closeSidebar(); navigate("/orders"); }}>
                <span className="gd-menu-label">Order Masuk</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {pending.length > 0 && (
                    <span className="gd-badge">{pending.length}</span>
                  )}
                  <ChevronRight size={18} color="#c4c4c4" />
                </div>
              </button>

              <div className="gd-divider" />

              {/* Notifikasi */}
              <button className="gd-menu-row" onClick={() => { closeSidebar(); if (pending.length > 0) { setNotifOrder(pending[0]); setShowNotifPopup(true); setCountdown(30); } }}>
                <span className="gd-menu-label">Notifikasi</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {pending.length > 0 && (
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444", display: "inline-block" }} />
                  )}
                  <ChevronRight size={18} color="#c4c4c4" />
                </div>
              </button>

              <div className="gd-divider" />

              {/* Saldo Saya */}
              <button className="gd-menu-row" onClick={() => { closeSidebar(); navigate("/tarik-saldo"); }}>
                <span className="gd-menu-label">Saldo Saya</span>
                <ChevronRight size={18} color="#c4c4c4" />
              </button>

              <div className="gd-divider" />

              {/* Top Up */}
              <button className="gd-menu-row" onClick={() => { closeSidebar(); navigate("/topup"); }}>
                <span className="gd-menu-label">Top Up Saldo</span>
                <ChevronRight size={18} color="#c4c4c4" />
              </button>

              <div className="gd-divider" />

              {/* Timbang */}
              <button className="gd-menu-row" onClick={() => { closeSidebar(); navigate("/timbang"); }}>
                <span className="gd-menu-label">Timbang Sampah</span>
                <ChevronRight size={18} color="#c4c4c4" />
              </button>

              <div className="gd-divider" />

              {/* Riwayat Pesanan */}
              <button className="gd-menu-row" onClick={() => { closeSidebar(); navigate("/riwayat"); }}>
                <span className="gd-menu-label">Riwayat Pesanan</span>
                <ChevronRight size={18} color="#c4c4c4" />
              </button>

              <div className="gd-divider" />

              {/* Chat */}
              <button className="gd-menu-row" onClick={() => { closeSidebar(); navigate("/chat"); }}>
                <span className="gd-menu-label">Pesan &amp; Chat</span>
                <ChevronRight size={18} color="#c4c4c4" />
              </button>

              <div className="gd-divider" />

              {/* Profil */}
              <button className="gd-menu-row" onClick={() => { closeSidebar(); navigate("/profil"); }}>
                <span className="gd-menu-label">Profil Saya</span>
                <ChevronRight size={18} color="#c4c4c4" />
              </button>

              <div className="gd-divider" />

              {/* Keluar */}
              <button
                className="gd-menu-row gd-menu-row--danger"
                onClick={async () => {
                  const { logout } = await import("../services/authService");
                  closeSidebar();
                  await logout();
                  navigate("/login");
                }}
              >
                <span className="gd-menu-label" style={{ color: "#ef4444" }}>Keluar</span>
                <LogOut size={17} color="#ef4444" />
              </button>

            </div>

          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          NOTIFIKASI SLIDE-UP POPUP (ShopeeFood Style)
          ══════════════════════════════════════════ */}


      {showNotifPopup && notifOrder && (
        <div className="notif-overlay" onClick={dismissNotif}>
          <div className="notif-popup" onClick={e => e.stopPropagation()}>
            <div className="notif-handle" />

            {/* Header */}
            <div className="notif-header">
              <div className="notif-bell-icon">
                <Bell size={22} />
              </div>
              <div className="notif-title">
                <h3>Order Baru Masuk! 🔔</h3>
                <p>Ada permintaan penjemputan sampah</p>
              </div>
              <button
                onClick={dismissNotif}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 4 }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="notif-body">
              {/* User info */}
              <div className="notif-user-row">
                <div className="notif-user-avatar">
                  {notifOrder.user_name ? notifOrder.user_name.charAt(0).toUpperCase() : "U"}
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: "0.9rem", color: "var(--text)" }}>
                    {notifOrder.user_name || `User #${notifOrder.user_id}`}
                  </div>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 500 }}>
                    Order #{notifOrder.id}
                  </div>
                </div>
              </div>

              {/* Alamat */}
              <div className="notif-info-row">
                <MapPin size={14} color="var(--brand)" style={{ flexShrink: 0, marginTop: 1 }} />
                <span style={{ fontSize: "0.82rem", color: "var(--text)", fontWeight: 600 }}>
                  {notifOrder.address}
                </span>
              </div>

              {/* Chips */}
              <div className="notif-chips">
                <span className="notif-chip" style={{ background: "var(--primary-light)", color: "var(--brand)" }}>
                  <Package size={12} />
                  {WASTE_EMOJI[notifOrder.waste_type?.toLowerCase()] || "🗑️"} {notifOrder.waste_type}
                </span>
                <span className="notif-chip" style={{ background: "var(--success-light)", color: "#065f46" }}>
                  <Scale size={12} />
                  ~{notifOrder.estimated_weight} kg
                </span>
                {notifOrder.pickup_fee && (
                  <span className="notif-chip" style={{ background: "var(--warning-light)", color: "#92400e" }}>
                    💰 Fee: Rp {Number(notifOrder.pickup_fee).toLocaleString("id-ID")}
                  </span>
                )}
              </div>

              {/* Estimated price */}
              <div style={{
                background: "var(--primary-light)", borderRadius: "var(--radius-md)",
                padding: "0.75rem 1rem", display: "flex", justifyContent: "space-between", alignItems: "center"
              }}>
                <span style={{ fontSize: "0.78rem", color: "var(--brand)", fontWeight: 600 }}>Estimasi Pendapatan</span>
                <span style={{ fontSize: "1rem", fontWeight: 900, color: "var(--brand)" }}>
                  Rp {((notifOrder.estimated_weight || 0) * (HARGA[notifOrder.waste_type?.toLowerCase()] || 1000)).toLocaleString("id-ID")}
                </span>
              </div>

              {/* Countdown */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontWeight: 600 }}>Otomatis ditutup dalam</span>
                  <span style={{ fontSize: "0.7rem", color: countdown <= 10 ? "var(--danger)" : "var(--brand)", fontWeight: 800 }}>{countdown}s</span>
                </div>
                <div className="notif-countdown">
                  <div className="notif-countdown-bar" style={{ width: `${(countdown / 30) * 100}%` }} />
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="notif-actions">
              <button
                className="btn btn-ghost btn-full"
                onClick={dismissNotif}
                style={{ flex: 1 }}
              >
                Tolak
              </button>
              <button
                className="btn btn-primary btn-full"
                onClick={handleTerimaFromNotif}
                disabled={accepting}
                style={{ flex: 2 }}
              >
                {accepting ? (
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                    Memproses...
                  </span>
                ) : "✅ Terima Order"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          MAIN DASHBOARD CONTENT (ShopeeFood Style)
          ══════════════════════════════════════════ */}
      <div className="sf-dashboard-container">
        
        {/* HEADER */}
        <div className="sf-header">
          <div className="sf-header-top">
            <div className="sf-profile-info">
              <div className="sf-avatar-wrapper" onClick={() => setIsSidebarOpen(true)}>
                {user.profile_photo ? (
                  <img src={user.profile_photo} alt="Profile" className="sf-avatar-img" />
                ) : (
                  <div className="sf-avatar-initial">{initials}</div>
                )}
                <span className={`sf-status-dot ${isOnline ? "sf-online" : "sf-offline"}`} />
              </div>
              <div className="sf-user-text">
                <div className="sf-user-name">{(user.name || "PETUGAS").toUpperCase()}</div>
                <div className="sf-user-status-text">
                  {isOnline ? "Status kerja aktif" : "Status kerja tidak aktif"}
                </div>
              </div>
            </div>

            <div className="sf-stats">
              <div className="sf-stat">
                <Star size={14} color="#f59e0b" fill="#f59e0b" />
                <span>{user.rating || "4.96"}</span>
              </div>
              <div className="sf-stat">
                <BarChart2 size={14} color="#f59e0b" />
                <span>{user.acceptance_rate || "100%"}</span>
              </div>
            </div>
          </div>

          {/* TABS */}
          <div className="sf-tabs">
            <div 
              className={`sf-tab ${activeTab === 'heatmap' ? 'active' : ''}`}
              onClick={() => setActiveTab('heatmap')}
              style={{cursor: 'pointer'}}
            >
              Heatmap
            </div>
            <div 
              className={`sf-tab ${activeTab === 'pesanan' ? 'active' : ''}`}
              onClick={() => setActiveTab('pesanan')}
              style={{cursor: 'pointer'}}
            >
              Daftar Pesanan
            </div>
          </div>
        </div>

        {/* INFO BANNER */}
        {!isOnline && (
          <div className="sf-info-banner">
            <Bell size={16} color="#d97706" style={{flexShrink: 0}} />
            <span>Aktifkan status kerja untuk mulai menerima pesanan dan mendapatkan penghasilan.</span>
            <ChevronRight size={16} color="#d97706" style={{flexShrink: 0}} />
          </div>
        )}

        {/* CONTENT AREA */}
        <div className="sf-content-area">
          {activeTab === 'heatmap' ? (
            <div style={{ borderRadius: "16px", overflow: "hidden", height: "450px", boxShadow: "var(--shadow-sm)", background: "white", padding: "4px" }}>
              <div style={{ borderRadius: "12px", overflow: "hidden", height: "100%" }}>
                <iframe
                  title="Heatmap Pekanbaru"
                  src="https://maps.google.com/maps?q=Pekanbaru&t=&z=12&ie=UTF8&iwloc=&output=embed"
                  width="100%"
                  height="100%"
                  style={{ border: 0 }}
                  allowFullScreen=""
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                ></iframe>
              </div>
            </div>
          ) : (
            <>
              {/* Active Order (Tampilkan jika ada) */}
              {currentOrder && (
                <div className="sf-active-order-card" style={{ marginBottom: "1rem" }}>
                  <div className="sf-order-header">
                    <span className="sf-order-type">
                      {WASTE_EMOJI[currentOrder.waste_type?.toLowerCase()] || "🗑️"} {currentOrder.waste_type}
                    </span>
                    <span className={`sf-order-status ${currentOrder.status === "on_the_way" ? "sf-status-otw" : "sf-status-acc"}`}>
                      {currentOrder.status === "on_the_way" ? "Di Jalan" : "Menunggu Jemput"}
                    </span>
                  </div>
                  <div className="sf-order-body">
                    <div className="sf-order-detail">
                      <MapPin size={18} color="var(--brand)" style={{ marginTop: 2, flexShrink: 0 }} />
                      <div>
                        <div className="sf-order-address">{currentOrder.address}</div>
                        <div className="sf-order-weight">
                          ~{currentOrder.estimated_weight} kg • Estimasi Pendapatan: Rp {estPrice.toLocaleString("id-ID")}
                        </div>
                      </div>
                    </div>
                    <button
                      className="sf-chat-btn"
                      onClick={() => navigate(`/chat?userId=${currentOrder.user_id}`)}
                    >
                      <MessageCircle size={18} />
                    </button>
                  </div>
                  <div className="sf-order-actions">
                    <button className="sf-btn-outline" onClick={() => navigate(`/orders/${currentOrder.id}`)}>Lihat Detail</button>
                    {currentOrder.status !== "on_the_way" ? (
                      <button className="sf-btn-primary" onClick={handleMulaiJemput}>Mulai Jemput</button>
                    ) : (
                      <button className="sf-btn-success" onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(currentOrder.address)}`, "_blank")}>Navigasi Peta</button>
                    )}
                  </div>
                </div>
              )}

              {/* Pending Orders (Tampilkan juga jika ada, jadi bisa ambil lebih dari satu) */}
              {pending.length > 0 && (
                <div className="sf-pending-list">
                  <div className="sf-section-title">Order Menunggu ({pending.length})</div>
                  {pending.map(p => (
                    <div key={p.id} className="sf-pending-card" onClick={() => navigate(`/orders/${p.id}`)}>
                        <div className="sf-pending-icon">
                          {WASTE_EMOJI[p.waste_type?.toLowerCase()] || "🗑️"}
                        </div>
                        <div className="sf-pending-info">
                          <div className="sf-pending-name">{p.user_name || `User #${p.user_id}`}</div>
                          <div className="sf-pending-addr">{p.address}</div>
                        </div>
                        <ChevronRight size={16} color="#94a3b8" />
                    </div>
                  ))}
                </div>
              )}

              {/* Empty State (Tampilkan jika tidak ada order sama sekali) */}
              {!currentOrder && pending.length === 0 && (
                <div className="sf-empty-state">
                  <div className="sf-illustration">
                    <div className="sf-circle-bg">
                  {/* Ilustrasi Motor / Kurir sederhana */}
                  <Truck size={48} color="#1e293b" />
                  <div className="sf-box-icon"><Package size={14} color="white" /></div>
                </div>
              </div>
              <div className="sf-empty-title">
                {isOnline ? "Mencari Pesanan..." : "Status kerja tidak aktif"}
              </div>
              <div className="sf-empty-subtitle">
                {isOnline ? (
                  "Pastikan aplikasi tetap terbuka. Kami sedang mencari pesanan sampah di sekitar Anda."
                ) : (
                  <>
                    Sudah siap terima pesanan? Pastikan:<br/><br/>
                    - Menggunakan atribut resmi secara lengkap.<br/>
                    - Siap onbid dan selesaikan pesanan yang masuk tanpa diabaikan.
                  </>
                )}
              </div>
            </div>
          )}
          </>
        )}
        </div>
      </div>
    </>
  );
}

export default Dashboard;
