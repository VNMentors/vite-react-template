import type { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { LayoutDashboard, Users, Package, BarChart2, UserCog, LogOut, Bell, Layers } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

export default function Layout({ children }: { children: ReactNode }) {
  const { user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();

  const { data: stats } = useQuery({
    queryKey: ["stats"],
    queryFn: () => api.getStats(),
    staleTime: 1000 * 60,
  });

  const followUpCount = stats?.followUps?.length ?? 0;

  function handleLogout() {
    logout();
    navigate("/login");
  }

  const navItem = (to: string, icon: ReactNode, label: string, badge?: number) => (
    <NavLink to={to} end={to === "/"}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
          isActive ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-100"
        }`
      }
    >
      <span className="flex-shrink-0">{icon}</span>
      <span className="flex-1">{label}</span>
      {badge != null && badge > 0 && (
        <span className="bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0">
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </NavLink>
  );

  return (
    <div className="flex h-screen bg-gray-50">
      <aside className="w-60 bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
        <div className="px-5 py-4 border-b border-gray-200">
          <h1 className="text-lg font-bold text-gray-900">VN Mentors CRM</h1>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={`w-1.5 h-1.5 rounded-full ${isAdmin ? "bg-blue-500" : "bg-green-500"}`} />
            <p className="text-xs text-gray-500">{isAdmin ? "Admin" : "Nhân viên"}</p>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-0.5">
          {navItem("/", <LayoutDashboard size={17} />, "Dashboard", followUpCount)}
          {navItem("/customers", <Users size={17} />, "Khách hàng")}
          {isAdmin && navItem("/groups",   <Layers size={17} />,  "Nhóm KH")}
          {isAdmin && navItem("/products", <Package size={17} />, "Sản phẩm")}
          {isAdmin && navItem("/reports", <BarChart2 size={17} />, "Báo cáo")}
          {isAdmin && navItem("/users", <UserCog size={17} />, "Nhân viên")}
        </nav>

        <div className="p-3 border-t border-gray-200">
          <div className="flex items-center gap-2.5 px-2 py-2 mb-1">
            <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">
              {user?.name?.[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{user?.name}</p>
              <p className="text-xs text-gray-400 truncate">{user?.email}</p>
            </div>
          </div>
          <button onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50 w-full transition-colors">
            <LogOut size={16} /> Đăng xuất
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}

export { Bell };
