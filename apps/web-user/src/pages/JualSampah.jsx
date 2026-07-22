import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import BottomNav from "../components/BottomNav";
import { ArrowLeft, Bell, ChevronDown, UploadCloud, ShieldCheck, TrendingUp, MapPin, Search, Menu } from "lucide-react";
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix Leaflet marker icon issue in React
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

function MapUpdater({ center }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom(), { animate: true });
  }, [center, map]);
  return null;
}

function MapPicker({ position, setPosition, setAddressString, onMapClick }) {
  useMapEvents({
    async click(e) {
      if (onMapClick) onMapClick();
      const lat = e.latlng.lat;
      const lng = e.latlng.lng;
      setPosition([lat, lng]);
      setAddressString("Mengambil detail lokasi...");
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
        const data = await res.json();
        if(data && data.display_name) {
          setAddressString(data.display_name);
        } else {
          setAddressString(`Titik Maps: ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
        }
      } catch (err) {
        setAddressString(`Titik Maps: ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      }
    },
  });
  return position ? <Marker position={position} /> : null;
}

function JualSampah() {
  const [wasteType, setWasteType] = useState("Besi");
  const [subCategory, setSubCategory] = useState("Besi");
  const [weightEstimate, setWeightEstimate] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [mapPosition, setMapPosition] = useState([0.5333, 101.4500]); // Pekanbaru default
  const [addressString, setAddressString] = useState("Pilih lokasi di peta (Tap pada peta)");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const requestSeq = useRef(0);
  const [locationSaved, setLocationSaved] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [wastePhoto, setWastePhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const navigate = useNavigate();

  const [estimateData, setEstimateData] = useState(null);
  const [isEstimating, setIsEstimating] = useState(false);

  const [profile, setProfile] = useState(null);
  const [profilePic, setProfilePic] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [wastePrices, setWastePrices] = useState({});
  const [categories, setCategories] = useState([]);
  const [isLoadingPrices, setIsLoadingPrices] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = localStorage.getItem("token");
        if(!token) return;
        const [profileRes, notifRes, pricesRes] = await Promise.all([
          api.get("/auth/profile", { headers: { Authorization: `Bearer ${token}` } }).catch(() => ({data: {user: null}})),
          api.get("/notifications", { headers: { Authorization: `Bearer ${token}` } }).catch(() => ({data: {notifications: []}})),
          api.get("/dashboard/waste-prices", { headers: { Authorization: `Bearer ${token}` } }).catch(() => ({data: {data: []}}))
        ]);
        
        const savedPic = localStorage.getItem("profilePic");
        if (savedPic) setProfilePic(savedPic);

        if(profileRes?.data?.user) setProfile(profileRes.data.user);
        if(notifRes?.data?.notifications) {
          setUnreadCount(notifRes.data.notifications.filter(n => !n.is_read).length);
        }

        if (pricesRes?.data?.data && pricesRes.data.data.length > 0) {
          const pricesObj = {};
          const cats = [];
          pricesRes.data.data.forEach(item => {
            pricesObj[item.type] = {
              price: Number(item.price),
              trend: 0,
              desc: item.desc || "Barang daur ulang",
              icon: item.icon || "♻️"
            };
            cats.push({ name: item.type, type: item.type });
          });
          setWastePrices(pricesObj);
          setCategories(cats);
          setWasteType(cats[0].type);
          setSubCategory(cats[0].name);
        } else {
          // Fallback if no prices from DB
          setWastePrices({ "Besi": { price: 1500, trend: 200, desc: "Besi tua", icon: "🔧" } });
          setCategories([{ name: "Besi", type: "Besi" }]);
        }
      } catch (err) {
        console.error("Failed to fetch data:", err);
      } finally {
        setIsLoadingPrices(false);
      }
    };
    fetchData();
  }, []);

  const handleRequest = async (e) => {
    e.preventDefault();
    setError("");

    if (!weightEstimate || Number(weightEstimate) < 4) {
      alert("Oops! Estimasi berat sampah minimal 4 kg ya.");
      return;
    }

    if (!mapPosition || mapPosition[0] === 0.5333) {
      alert("Harap pilih lokasi penjemputan terlebih dahulu.");
      return;
    }

    if (!estimateData) {
      alert("Harap cek estimasi biaya terlebih dahulu.");
      return;
    }

    setIsSubmitting(true);
    
    try {
      const token = localStorage.getItem("token");
      await api.post("/pickups", {
        waste_type: wasteType,
        estimated_weight: Number(weightEstimate),
        address: addressString,
        latitude: mapPosition[0],
        longitude: mapPosition[1],
        pickup_date: new Date().toISOString().split('T')[0]
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setIsSubmitting(false);
      setShowSuccessModal(true);
    } catch (err) {
      setIsSubmitting(false);
      setError(err.response?.data?.message || "Gagal mengirim pesanan");
    }
  };

  const handleEstimate = async () => {
    if (!weightEstimate || Number(weightEstimate) < 4) {
      alert("Oops! Estimasi berat sampah minimal 4 kg ya.");
      return;
    }
    if (!mapPosition || mapPosition[0] === 0.5333) {
      alert("Harap pilih lokasi penjemputan di peta terlebih dahulu.");
      return;
    }
    setError("");
    setIsEstimating(true);
    try {
      const token = localStorage.getItem("token");
      const res = await api.post("/pickups/estimate", {
        waste_type: wasteType,
        estimated_weight: Number(weightEstimate),
        latitude: mapPosition[0],
        longitude: mapPosition[1]
      }, { headers: { Authorization: `Bearer ${token}` } });
      setEstimateData(res.data);
    } catch (err) {
      setEstimateData(null);
      setError(err.response?.data?.message || "Gagal mendapatkan estimasi biaya.");
    } finally {
      setIsEstimating(false);
    }
  };

  const handleSearchLocation = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    requestSeq.current += 1;
    setIsGettingLocation(false);
    try {
      const finalQuery = searchQuery.toLowerCase().includes('pekanbaru') 
        ? searchQuery 
        : `${searchQuery}, Pekanbaru`;
      
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(finalQuery)}&countrycodes=id&limit=1`);
      const data = await res.json();
      if (data && data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lon = parseFloat(data[0].lon);
        setMapPosition([lat, lon]);
        setAddressString(data[0].display_name);
      } else {
        alert("Lokasi tidak ditemukan! Coba kata kunci yang lebih spesifik.");
      }
    } catch (err) {
      alert("Gagal mencari lokasi.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert("Browser Anda tidak mendukung fitur Geolocation.");
      return;
    }
    
    setIsGettingLocation(true);
    setAddressString("Mengambil lokasi Anda...");
    
    requestSeq.current += 1;
    const currentSeq = requestSeq.current;
    
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        if (requestSeq.current !== currentSeq) return;
        
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setMapPosition([lat, lng]);
        
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
          if (requestSeq.current !== currentSeq) return;
          
          const data = await res.json();
          if(data && data.display_name) {
            setAddressString(data.display_name);
          } else {
            setAddressString(`Titik Maps: ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
          }
        } catch (err) {
          if (requestSeq.current !== currentSeq) return;
          setAddressString(`Titik Maps: ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
        } finally {
          if (requestSeq.current === currentSeq) {
            setIsGettingLocation(false);
          }
        }
      },
      (err) => {
        if (requestSeq.current !== currentSeq) return;
        
        setIsGettingLocation(false);
        setAddressString("Gagal mengambil lokasi");
        let errorMessage = "Gagal mengambil lokasi Anda.";
        if (err.code === 1) errorMessage = "Akses lokasi ditolak. Harap izinkan akses lokasi di pengaturan browser Anda (Error Code: 1 - Permission Denied).";
        else if (err.code === 2) errorMessage = "Lokasi tidak tersedia atau tidak dapat diakses (Error Code: 2 - Position Unavailable).";
        else if (err.code === 3) errorMessage = "Waktu pencarian lokasi habis (Error Code: 3 - Timeout).";
        
        alert(errorMessage);
        console.error("Geolocation Error:", err);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  };

  if (isLoadingPrices) {
    return <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>Memuat...</div>;
  }

  const currentPrice = wastePrices[wasteType]?.price || 0;
  const currentWeight = Number(weightEstimate) || 0;
  const estimatedTotal = currentPrice * currentWeight;

  return (
    <div className="app-container" style={{ background: "#f8fafc", minHeight: "100vh", paddingBottom: "100px", fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        .jsp-header { background: white; padding: 1.5rem 2.5%; display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; zIndex: 10; border-bottom: 1px solid #f1f5f9; }
        .jsp-title { font-size: 1.4rem; font-weight: 800; color: #1e293b; margin: 0; }
        .jsp-subtitle { font-size: 0.85rem; color: #64748b; margin: 0.25rem 0 0 0; }
        .jsp-back-btn { background: white; border: 1px solid #e2e8f0; border-radius: 12px; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: background 0.2s; }
        .jsp-back-btn:hover { background: #f8fafc; }
        
        .jsp-grid { display: grid; grid-template-columns: 1.3fr 1fr; gap: 2rem; padding: 2rem 2.5%; max-width: 1440px; margin: 0 auto; }
        
        .jsp-card { background: white; border-radius: 20px; padding: 2rem; box-shadow: 0 4px 20px rgba(0,0,0,0.02); }
        .jsp-card-title { font-size: 1.2rem; font-weight: 800; color: #0f172a; margin: 0 0 0.25rem 0; }
        .jsp-card-subtitle { font-size: 0.85rem; color: #64748b; margin: 0 0 1.5rem 0; }
        
        .jsp-label { display: block; font-size: 0.85rem; font-weight: 700; color: #1e293b; margin-bottom: 0.75rem; }
        
        .jsp-select-container { position: relative; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1rem; display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; }
        .jsp-native-select { position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; }
        
        .jsp-cat-tabs { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1.5rem; }
        .jsp-cat-tab { padding: 0.6rem 1rem; border-radius: 20px; border: 1px solid #e2e8f0; background: white; font-size: 0.85rem; font-weight: 600; color: #64748b; cursor: pointer; transition: all 0.2s; position: relative; }
        .jsp-cat-tab.active { border-color: #16a34a; color: #16a34a; background: #f0fdf4; }
        .jsp-cat-tab.active::after { content: "✓"; position: absolute; top: -5px; right: -5px; background: #16a34a; color: white; width: 16px; height: 16px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.6rem; }
        
        .jsp-weight-input { border: 1px solid #e2e8f0; border-radius: 12px; padding: 1rem; display: flex; align-items: center; margin-bottom: 0.5rem; }
        .jsp-weight-input input { border: none; outline: none; font-size: 1.1rem; font-weight: 700; color: #1e293b; flex: 1; }
        
        .jsp-upload-box { border: 2px dashed #e2e8f0; border-radius: 12px; padding: 2rem; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.5rem; background: #f8fafc; cursor: pointer; transition: border-color 0.2s; margin-bottom: 2rem; }
        .jsp-upload-box:hover { border-color: #16a34a; background: #f0fdf4; }
        
        .jsp-summary-box { background: #f0fdf4; border-radius: 16px; padding: 1.5rem; margin-bottom: 1.5rem; display: flex; justify-content: space-between; align-items: center; border: 1px solid #dcfce7; }
        .jsp-summary-item { display: flex; flex-direction: column; gap: 0.25rem; }
        .jsp-summary-label { font-size: 0.8rem; font-weight: 600; color: #475569; }
        .jsp-summary-value { font-size: 1.1rem; font-weight: 800; color: #1e293b; }
        .jsp-summary-total { font-size: 1.5rem; font-weight: 800; color: #16a34a; }
        
        .jsp-btn-submit { width: 100%; background: #064e3b; color: white; border: none; padding: 1.1rem; border-radius: 12px; font-weight: 700; font-size: 1rem; cursor: pointer; display: flex; justify-content: center; align-items: center; gap: 0.5rem; transition: background 0.2s; box-shadow: 0 4px 12px rgba(6, 78, 59, 0.2); }
        .jsp-btn-submit:hover { background: #022c22; }
        
        .jsp-price-list { display: flex; flex-direction: column; gap: 1rem; margin-bottom: 1.5rem; }
        .jsp-price-item { display: flex; align-items: center; justify-content: space-between; padding-bottom: 1rem; border-bottom: 1px solid #f1f5f9; }
        .jsp-price-item:last-child { border-bottom: none; padding-bottom: 0; }
        .jsp-price-left { display: flex; align-items: center; gap: 1rem; }
        .jsp-price-icon { width: 40px; height: 40px; border-radius: 10px; background: #f1f5f9; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; }
        .jsp-price-right { display: flex; align-items: center; gap: 1rem; }
        .jsp-trend-badge { background: #dcfce7; color: #166534; padding: 0.2rem 0.5rem; border-radius: 20px; font-size: 0.75rem; font-weight: 700; display: flex; align-items: center; gap: 0.25rem; }
        .jsp-trend-neutral { background: #f1f5f9; color: #64748b; }
        
        .jsp-btn-outline { width: 100%; background: transparent; border: 1px solid #e2e8f0; color: #1e293b; padding: 0.85rem; border-radius: 12px; font-weight: 700; font-size: 0.9rem; cursor: pointer; display: flex; justify-content: center; align-items: center; gap: 0.5rem; transition: background 0.2s; }
        .jsp-btn-outline:hover { background: #f8fafc; }
        
        .jsp-tips-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
        .jsp-tip-card { background: #f8fafc; border-radius: 12px; padding: 1rem; }
        .jsp-tip-title { font-size: 0.85rem; font-weight: 700; color: #1e293b; margin: 0 0 0.5rem 0; display: flex; align-items: center; gap: 0.5rem; }
        .jsp-tip-desc { font-size: 0.75rem; color: #64748b; margin: 0; line-height: 1.4; }
        
        @media (max-width: 1024px) {
          .jsp-grid { grid-template-columns: 1fr; }
        }

        @media (max-width: 640px) {
          .jsp-header { padding: 1rem 4%; }
          .jsp-title { font-size: 1rem; }
          .jsp-subtitle { font-size: 0.7rem; }
          .jsp-header-left { gap: 0.75rem !important; }
          .jsp-header-right { gap: 0.5rem !important; }
          .jsp-btn-bell { width: 34px !important; height: 34px !important; }
          .jsp-btn-profile { padding: 0.3rem 0.6rem 0.3rem 0.3rem !important; gap: 0.5rem !important; }
          .jsp-btn-profile-img { width: 28px !important; height: 28px !important; }
          .jsp-btn-profile-text { font-size: 0.8rem !important; }
          .jsp-btn-profile-badge { font-size: 0.6rem !important; padding: 0.1rem 0.3rem !important; }
          
          .jsp-grid { padding: 1rem 4%; gap: 1.25rem; }
          .jsp-card { padding: 1.25rem; border-radius: 16px; }
          .jsp-card-title { font-size: 1rem; }
          .jsp-summary-box { flex-direction: column; gap: 1rem; align-items: flex-start; }
          .jsp-summary-box > div:last-child { width: 100%; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.5rem; }
          .jsp-summary-item { align-items: flex-start; }
          .jsp-summary-total { font-size: 1.2rem; }
          .jsp-tips-grid { grid-template-columns: 1fr 1fr; }
          .jsp-price-right { gap: 0.5rem; }
          .jsp-price-right span { font-size: 0.78rem; }
          .jsp-btn-submit { padding: 0.9rem; font-size: 0.95rem; }
          .jsp-upload-box { padding: 1.5rem; }
          .jsp-cat-tabs { gap: 0.4rem; }
          .jsp-cat-tab { padding: 0.5rem 0.75rem; font-size: 0.8rem; }
        }

        @media (max-width: 400px) {
          .jsp-tips-grid { grid-template-columns: 1fr; }
          .jsp-summary-box > div:last-child { grid-template-columns: 1fr 1fr; }
          .jsp-title { font-size: 0.95rem; }
          .jsp-subtitle { display: none; }
        }
      `}</style>

      {/* Header */}
      <div className="jsp-header">
        <div className="jsp-header-left" style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
          <button className="topbar-menu-btn" onClick={() => window.dispatchEvent(new Event("toggle-sidebar"))} style={{ display: "flex" }}>
            <Menu size={22} />
          </button>
          <div>
            <h2 className="jsp-title">Jual Sampah</h2>
            <p className="jsp-subtitle">Tukar sampahmu menjadi cuan <span style={{ color: "#16a34a" }}>💚</span></p>
          </div>
        </div>
        
        <div className="jsp-header-right" style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <div className="jsp-btn-bell" onClick={() => {/* TODO: halaman notifikasi belum dibuat navigate('/notifications') */}} style={{ position: "relative", cursor: "pointer", background: "white", width: "40px", height: "40px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #e2e8f0" }}>
            <Bell size={20} color="#475569" style={{margin: "auto"}} />
            {unreadCount > 0 && (
              <div className="jsp-btn-profile-badge" style={{ position: "absolute", top: "-2px", right: "-2px", width: "16px", height: "16px", background: "#ef4444", borderRadius: "50%", border: "2px solid white", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: "9px", fontWeight: "bold" }}>{unreadCount > 9 ? '9+' : unreadCount}</div>
            )}
          </div>
          <div className="jsp-btn-profile" onClick={() => navigate('/profile')} style={{ display: "flex", alignItems: "center", gap: "0.75rem", background: "white", padding: "0.4rem 1rem 0.4rem 0.4rem", borderRadius: "30px", border: "1px solid #e2e8f0", cursor: "pointer" }}>
            {profilePic ? (
              <img className="jsp-btn-profile-img" src={profilePic} alt="Profile" style={{ width: "32px", height: "32px", borderRadius: "50%", objectFit: "cover", border: "2px solid white" }} />
            ) : (
              <div className="jsp-btn-profile-img" style={{ width: "32px", height: "32px", borderRadius: "50%", background: "var(--brand-green)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "700", fontSize: "0.9rem" }}>
                {profile?.name ? profile.name.charAt(0).toUpperCase() : 'U'}
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span className="jsp-btn-profile-text" style={{ fontSize: "0.9rem", fontWeight: "700", color: "#1e293b", maxWidth: "80px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {profile?.name ? profile.name.split(' ')[0] : 'User'}
              </span>
              <span className="jsp-btn-profile-text" style={{ background: "#fef3c7", color: "#b45309", fontSize: "0.75rem", fontWeight: "700", padding: "0.2rem 0.6rem", borderRadius: "20px" }}>{profile?.role === 'pengepul' ? 'Mitra' : 'Gold'}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="jsp-grid">
        {/* Left Column: Form */}
        <div className="jsp-card">
          <h2 className="jsp-card-title">Form Jual Sampah</h2>
          <p className="jsp-card-subtitle">Isi detail sampah yang ingin kamu jual</p>

          <form onSubmit={handleRequest}>
            {error && <div style={{ color: "#ef4444", fontSize: "0.85rem", marginBottom: "1.5rem", background: "#fee2e2", padding: "1rem", borderRadius: "12px", fontWeight: "600" }}>{error}</div>}
            {success && <div style={{ color: "#166534", fontSize: "0.85rem", marginBottom: "1.5rem", background: "#dcfce7", padding: "1rem", borderRadius: "12px", fontWeight: "600" }}>{success}</div>}

            <label className="jsp-label">Jenis Sampah</label>
            <div className="jsp-select-container" style={{ cursor: "pointer" }} onClick={() => setIsDropdownOpen(!isDropdownOpen)}>
              <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: "#f0fdf4", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem" }}>
                  {wastePrices[wasteType].icon}
                </div>
                <div>
                  <div style={{ fontSize: "0.95rem", fontWeight: "700", color: "#1e293b" }}>{wasteType}</div>
                  <div style={{ fontSize: "0.8rem", color: "#64748b" }}>{wastePrices[wasteType].desc}</div>
                </div>
              </div>
              <ChevronDown size={20} color="#94a3b8" style={{ transform: isDropdownOpen ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }} />
              
              {isDropdownOpen && (
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "white", border: "1px solid #e2e8f0", borderRadius: "12px", marginTop: "0.5rem", boxShadow: "0 10px 25px rgba(0,0,0,0.05)", zIndex: 50, overflow: "hidden" }}>
                  {Object.keys(wastePrices).map(key => (
                    <div 
                      key={key} 
                      onClick={(e) => { e.stopPropagation(); setWasteType(key); setSubCategory(""); setIsDropdownOpen(false); }}
                      style={{ padding: "1rem", display: "flex", alignItems: "center", gap: "1rem", borderBottom: "1px solid #f8fafc", cursor: "pointer", background: wasteType === key ? "#f0fdf4" : "white" }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "#f8fafc"}
                      onMouseLeave={(e) => e.currentTarget.style.background = wasteType === key ? "#f0fdf4" : "white"}
                    >
                      <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem" }}>
                        {wastePrices[key].icon}
                      </div>
                      <div>
                        <div style={{ fontSize: "0.9rem", fontWeight: "700", color: "#1e293b" }}>{key}</div>
                        <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{wastePrices[key].desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <label className="jsp-label">Pilih Kategori Cepat</label>
            <div className="jsp-cat-tabs">
              {categories.map(cat => (
                <div 
                  key={cat.name} 
                  className={`jsp-cat-tab ${subCategory === cat.name ? 'active' : ''}`}
                  onClick={() => {
                    setSubCategory(cat.name);
                    setWasteType(cat.type);
                  }}
                >
                  {cat.name}
                </div>
              ))}
            </div>

            <label className="jsp-label">Berat Sampah (KG)</label>
            <div className="jsp-weight-input">
              <input 
                type="number" 
                step="0.1" 
                placeholder="4.0" 
                value={weightEstimate}
                onChange={(e) => setWeightEstimate(e.target.value)}
                required
              />
              <span style={{ fontSize: "0.9rem", fontWeight: "700", color: "#64748b" }}>kg</span>
            </div>
            <p style={{ fontSize: "0.75rem", color: "#64748b", margin: "0 0 1.5rem 0" }}>Minimal 4 kg</p>

            <label className="jsp-label">Foto Sampah (Opsional)</label>
            <label className="jsp-upload-box" style={{ padding: photoPreview ? "0" : "2rem", overflow: "hidden" }}>
              <input 
                type="file" 
                accept="image/*" 
                capture="environment" 
                style={{ display: "none" }} 
                onChange={(e) => {
                  const file = e.target.files[0];
                  if (file) {
                    setWastePhoto(file);
                    setPhotoPreview(URL.createObjectURL(file));
                  }
                }}
              />
              {photoPreview ? (
                <img src={photoPreview} alt="Preview" style={{ width: "100%", height: "200px", objectFit: "cover", borderRadius: "12px" }} />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem" }}>
                  <UploadCloud size={28} color="#94a3b8" />
                  <div style={{ fontSize: "0.85rem", fontWeight: "600", color: "#475569", textAlign: "center" }}>Tap untuk Buka Kamera / Galeri</div>
                  <div style={{ fontSize: "0.75rem", color: "#94a3b8", textAlign: "center" }}>Tersimpan otomatis setelah difoto</div>
                </div>
              )}
            </label>

            <label className="jsp-label">Lokasi Penjemputan (Maps)</label>
            <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
              <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "center" }}>
                <Search size={18} color="#94a3b8" style={{ position: "absolute", left: "1rem" }} />
                <input 
                  type="text" 
                  placeholder="Cari jalan, kecamatan, atau kota..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => { if(e.key === 'Enter') { e.preventDefault(); handleSearchLocation(e); } }}
                  style={{ width: "100%", padding: "0.8rem 1rem 0.8rem 2.5rem", border: "1px solid #e2e8f0", borderRadius: "12px", outline: "none", fontSize: "0.9rem" }}
                />
              </div>
              <button 
                type="button" 
                onClick={handleSearchLocation} 
                disabled={isSearching}
                style={{ background: "#16a34a", color: "white", border: "none", padding: "0 1.5rem", borderRadius: "12px", fontWeight: "600", cursor: "pointer", transition: "background 0.2s" }}
              >
                {isSearching ? "Mencari..." : "Cari"}
              </button>
            </div>

            <div style={{ border: "1px solid #e2e8f0", borderRadius: "12px", overflow: "hidden", marginBottom: "0.5rem" }}>
              <MapContainer center={mapPosition} zoom={13} style={{ height: "300px", width: "100%", zIndex: 1 }}>
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; OpenStreetMap'
                />
                <MapUpdater center={mapPosition} />
                <MapPicker 
                  position={mapPosition} 
                  setPosition={setMapPosition} 
                  setAddressString={setAddressString} 
                  onMapClick={() => {
                    requestSeq.current += 1;
                    setIsGettingLocation(false);
                  }}
                />
              </MapContainer>
            </div>
            <div className="jsp-weight-input" style={{ background: "#f8fafc", marginBottom: "1.5rem", padding: "0.5rem 1rem", alignItems: "center" }}>
              <MapPin size={20} color="#16a34a" style={{ marginRight: "0.5rem", flexShrink: 0 }} />
              <input 
                type="text" 
                value={addressString}
                onChange={(e) => setAddressString(e.target.value)}
                style={{ fontSize: "0.85rem", fontWeight: "600", color: "#475569", background: "transparent", width: "100%", outline: "none", border: "none" }}
                required
              />
              <button 
                type="button" 
                onClick={handleCurrentLocation}
                disabled={isGettingLocation}
                title="Gunakan Lokasi Sekarang"
                style={{ background: "#f1f5f9", color: "#1e293b", border: "1px solid #cbd5e1", padding: "0.5rem", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", marginLeft: "0.5rem", flexShrink: 0, transition: "all 0.2s" }}
              >
                {isGettingLocation ? (
                  <span style={{ fontSize: "0.8rem", fontWeight: "700" }}>...</span>
                ) : (
                  <MapPin size={16} /> 
                )}
              </button>

              <button 
                type="button" 
                onClick={() => {
                  setLocationSaved(true);
                  setTimeout(() => setLocationSaved(false), 2000);
                }}
                style={{ background: locationSaved ? "#16a34a" : "#e2e8f0", color: locationSaved ? "white" : "#1e293b", border: "none", padding: "0.5rem 1rem", borderRadius: "8px", fontWeight: "700", fontSize: "0.8rem", cursor: "pointer", marginLeft: "0.5rem", flexShrink: 0, transition: "all 0.2s" }}
              >
                {locationSaved ? "Tersimpan ✓" : "Simpan"}
              </button>
            </div>

            <button
              type="button"
              onClick={handleEstimate}
              disabled={isEstimating}
              style={{ width: "100%", background: "#e2e8f0", color: "#1e293b", border: "none", padding: "1rem", borderRadius: "12px", fontWeight: "700", fontSize: "0.95rem", cursor: "pointer", marginBottom: "1.5rem", transition: "background 0.2s" }}
            >
              {isEstimating ? "Mengecek Ketersediaan & Biaya..." : "Cek Ketersediaan & Estimasi Biaya"}
            </button>

            <div className="jsp-summary-box" style={{ flexDirection: "column", gap: "1rem", alignItems: "flex-start" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", width: "100%" }}>
                <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: estimateData ? "#16a34a" : "#94a3b8", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem" }}>{estimateData ? "✓" : "?"}</div>
                <span style={{ fontSize: "0.9rem", fontWeight: "700", color: "#0f172a" }}>Ringkasan Estimasi</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", width: "100%" }}>
                <div className="jsp-summary-item">
                  <span className="jsp-summary-label">Pendapatan (Perkiraan)</span>
                  <span className="jsp-summary-total">Rp {estimatedTotal.toLocaleString("id-ID")}</span>
                </div>
                <div className="jsp-summary-item">
                  <span className="jsp-summary-label">Biaya Penjemputan</span>
                  <span className="jsp-summary-value" style={{ color: estimateData?.pickup_fee > 0 ? "#ef4444" : "#16a34a" }}>
                    {estimateData ? ((estimateData.pickup_fee || 0) > 0 ? `- Rp ${(estimateData.pickup_fee || 0).toLocaleString("id-ID")}` : "Gratis") : "-"}
                  </span>
                </div>
                <div className="jsp-summary-item">
                  <span className="jsp-summary-label">Jarak Petugas</span>
                  <span className="jsp-summary-value">{estimateData && estimateData.distance_km != null ? `${Number(estimateData.distance_km).toFixed(1)} km` : "-"}</span>
                </div>
                <div className="jsp-summary-item">
                  <span className="jsp-summary-label">Total Bersih</span>
                  <span className="jsp-summary-total" style={{ color: "#16a34a" }}>
                    {estimateData ? `Rp ${Math.max(0, estimatedTotal - (estimateData.pickup_fee || 0)).toLocaleString("id-ID")}` : "-"}
                  </span>
                </div>
              </div>
            </div>

            <button type="submit" className="jsp-btn-submit" disabled={isSubmitting} style={{ opacity: isSubmitting ? 0.7 : 1 }}>
              {isSubmitting ? "Memproses..." : <><ShieldCheck size={20} /> Jual Sekarang</>}
            </button>
            <div style={{ textAlign: "center", fontSize: "0.75rem", color: "#64748b", marginTop: "1rem", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.35rem", fontWeight: "600" }}>
              <ShieldCheck size={14} color="#16a34a" /> Transaksi aman & saldo langsung masuk
            </div>
          </form>
        </div>

        {/* Right Column: Info & Tips */}
        <div>
          <div className="jsp-card" style={{ marginBottom: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem" }}>
              <div style={{ flex: 1 }}>
                <h2 className="jsp-card-title">Daftar Harga Sampah</h2>
                <p className="jsp-card-subtitle" style={{ margin: 0 }}>*Harga dapat diubah dan ditentukan oleh Pengepul</p>
              </div>
              <span style={{ fontSize: "0.7rem", color: "#16a34a", background: "#f0fdf4", padding: "0.3rem 0.6rem", borderRadius: "20px", fontWeight: "600" }}>Update: 22 Juni 2026</span>
            </div>

            <div className="jsp-price-list">
              {Object.keys(wastePrices).map(key => {
                const item = wastePrices[key];
                return (
                  <div key={key} className="jsp-price-item">
                    <div className="jsp-price-left">
                      <div className="jsp-price-icon">{item.icon}</div>
                      <span style={{ fontSize: "0.9rem", fontWeight: "700", color: "#1e293b" }}>{key}</span>
                    </div>
                    <div className="jsp-price-right">
                      <span style={{ fontSize: "0.85rem", fontWeight: "700", color: "#0f172a" }}>Rp {item.price.toLocaleString("id-ID")} / kg</span>
                      <div className={`jsp-trend-badge ${item.trend === 0 ? 'jsp-trend-neutral' : ''}`}>
                        <TrendingUp size={12} color={item.trend === 0 ? '#64748b' : '#16a34a'} /> <span style={{ color: item.trend === 0 ? '#64748b' : '#16a34a'}}>{item.trend === 0 ? '0' : '+ ' + item.trend}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <button className="jsp-btn-outline" style={{ marginTop: "1rem" }}>
              <TrendingUp size={16} /> Lihat Riwayat Harga
            </button>
          </div>

          <div className="jsp-card">
            <h2 className="jsp-card-title" style={{ marginBottom: "1.25rem" }}>Tips Sebelum Jual Sampah</h2>
            <div className="jsp-tips-grid">
              <div className="jsp-tip-card">
                <div className="jsp-tip-title"><span style={{ color: "#16a34a", fontSize: "1.2rem" }}>🍃</span> Bersihkan Sampah</div>
                <p className="jsp-tip-desc">Bersihkan dari sisa makanan atau kotoran agar harga lebih tinggi.</p>
              </div>
              <div className="jsp-tip-card">
                <div className="jsp-tip-title"><span style={{ color: "#f59e0b", fontSize: "1.2rem" }}>☀️</span> Keringkan</div>
                <p className="jsp-tip-desc">Pastikan sampah dalam keadaan kering untuk kualitas terbaik.</p>
              </div>
              <div className="jsp-tip-card">
                <div className="jsp-tip-title"><span style={{ color: "#16a34a", fontSize: "1.2rem" }}>⚖️</span> Timbang Akurat</div>
                <p className="jsp-tip-desc">Gunakan timbangan yang akurat untuk hasil yang lebih adil.</p>
              </div>
              <div className="jsp-tip-card">
                <div className="jsp-tip-title"><span style={{ color: "#f59e0b", fontSize: "1.2rem" }}>⭐</span> Pilah dengan Baik</div>
                <p className="jsp-tip-desc">Pisahkan berdasarkan jenisnya untuk memudahkan proses.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showSuccessModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }}>
          <div style={{ background: "white", padding: "2.5rem 2rem", borderRadius: "24px", textAlign: "center", maxWidth: "90%", width: "350px", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)" }}>
            <div style={{ width: "80px", height: "80px", background: "#dcfce7", color: "#16a34a", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1.5rem auto" }}>
              <ShieldCheck size={40} />
            </div>
            <h3 style={{ margin: "0 0 0.5rem 0", color: "#0f172a", fontSize: "1.5rem", fontWeight: "800" }}>Mantap!</h3>
            <p style={{ color: "#475569", fontSize: "0.95rem", marginBottom: "2rem", lineHeight: "1.6" }}>
              Data sampahmu berhasil dikirim. Pengepul terdekat akan segera merespon dan menjemput!
            </p>
            <button 
              onClick={() => { setShowSuccessModal(false); navigate("/dashboard"); }}
              style={{ width: "100%", background: "#16a34a", color: "white", border: "none", padding: "1rem", borderRadius: "14px", fontWeight: "700", cursor: "pointer", fontSize: "1rem", transition: "background 0.2s" }}
            >
              Kembali ke Beranda
            </button>
          </div>
        </div>
      )}
      
      <BottomNav />
    </div>
  );
}

export default JualSampah;
