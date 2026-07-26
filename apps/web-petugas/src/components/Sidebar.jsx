import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, ClipboardList, History,
  User, Scale, LogOut, Recycle, ShieldCheck
} from "lucide-react";
import { logout } from "../services/authService";

const menuGroups = [
  {
    label: "Operasional",
    items: [
      { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
      { to: "/orders", icon: ClipboardList, label: "Order Masuk" },
      { to: "/riwayat", icon: History, label: "Riwayat" },
      { to: "/timbang", icon: Scale, label: "Timbang" },
    ]
  },
  {
    label: "Akun",
    items: [
      { to: "/profil", icon: User, label: "Profil" },
    ]
  }
];

function Sidebar({ user }) {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const initial = user?.name?.charAt(0).toUpperCase() || "P";

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <Recycle size={22} />
        </div>
        <div className="sidebar-brand">
          <strong className="sidebar-brand-name">Pilah Pilih</strong>
          <span className="sidebar-brand-sub">Petugas Panel</span>
        </div>
      </div>

      {/* Navigation */}
      <div className="sidebar-menu">
        {menuGroups.map((group) => (
          <div key={group.label}>
            <div className="sidebar-section-label">{group.label}</div>
            {group.items.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) => `menu-item${isActive ? " active" : ""}`}
              >
                <span className="menu-icon"><Icon size={18} /></span>
                <span>{label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </div>

      {/* Bottom user block */}
      <div className="sidebar-footer">
        <div className="sidebar-user" onClick={() => navigate("/profil")}>
          <div className="sidebar-user-avatar">
            {initial}
          </div>
          <div className="sidebar-user-info">
            <strong>{user?.name || "Petugas"}</strong>
            <span><ShieldCheck size={11} style={{ marginRight: 3, verticalAlign: -2 }} />Petugas Aktif</span>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="menu-item btn-ghost"
          style={{ width: "100%", marginTop: "0.5rem", color: "var(--danger)", background: "rgba(239,68,68,0.05)", border: "none" }}
        >
          <span className="menu-icon"><LogOut size={18} /></span>
          Keluar
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;
