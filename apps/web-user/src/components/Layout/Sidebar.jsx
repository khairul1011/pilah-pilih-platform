import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Home, Recycle, ScanLine, Gift, User, BookOpen,
  MessageCircle, Wallet, Truck, History, LogOut, Leaf, X
} from "lucide-react";

function Sidebar({ onLogout, isOpen, onClose }) {
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (path) => {
    return location.pathname === path || location.pathname.startsWith(path + "/");
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    navigate("/login");
  };

  const menuGroups = [
    {
      label: "Menu Utama",
      items: [
        { path: "/dashboard", icon: <Home size={20} />, label: "Beranda" },
        { path: "/jual-sampah", icon: <Recycle size={20} />, label: "Jual Sampah" },
        { path: "/pickup", icon: <Truck size={20} />, label: "Jemput Sampah" },
        { path: "/ai-scan", icon: <ScanLine size={20} />, label: "AI Scan" },
      ],
    },
    {
      label: "Keuangan",
      items: [
        { path: "/wallet", icon: <Wallet size={20} />, label: "Dompet" },
        { path: "/withdraw", icon: <Wallet size={20} />, label: "Tarik Saldo" },
        { path: "/history", icon: <History size={20} />, label: "Riwayat" },
      ],
    },
    {
      label: "Lainnya",
      items: [
        { path: "/reward", icon: <Gift size={20} />, label: "Reward" },
        { path: "/edukasi", icon: <BookOpen size={20} />, label: "Edukasi" },
        { path: "/chat", icon: <MessageCircle size={20} />, label: "Chat" },
        { path: "/profile", icon: <User size={20} />, label: "Profil Saya" },
      ],
    },
  ];

  return (
    <aside className={`sidebar ${isOpen ? "open" : ""}`}>
      {/* Brand */}
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <Leaf size={22} />
        </div>
        <div className="sidebar-brand">
          <span className="sidebar-brand-name">PilahPilih</span>
          <span className="sidebar-brand-sub">Daur Ulang, Raih Untung</span>
        </div>
        {onClose && (
          <button className="sidebar-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        )}
      </div>

      {/* Menu */}
      <div className="sidebar-menu">
        {menuGroups.map((group) => (
          <div key={group.label}>
            <div className="sidebar-section-label">{group.label}</div>
            {group.items.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`menu-item ${isActive(item.path) ? "active" : ""}`}
              >
                <span className="menu-icon">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="sidebar-footer">
        <button className="menu-item btn-ghost" onClick={handleLogout} style={{ width: '100%', border: 'none', cursor: 'pointer', color: 'var(--danger)', background: 'rgba(239,68,68,0.05)' }}>
          <span className="menu-icon"><LogOut size={18} /></span>
          <span>Keluar</span>
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;
