"use client";

import { useState, useRef, useEffect } from "react";
import { Search, Bell, Moon, Sun, User, ChevronDown, LogOut } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";

const PERIOD_OPTIONS = [
  { id: "hoy", label: "Hoy" },
  { id: "7d", label: "7 días" },
  { id: "30d", label: "30 días" },
  { id: "mes", label: "Mes actual" },
  { id: "anio", label: "Año" },
];

export default function Header() {
  const { theme, toggleTheme } = useTheme();
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState("mes");
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-4 border-b border-[#E5E7EB] bg-white px-6 dark:border-slate-700 dark:bg-slate-900">
      {/* Buscador global */}
      <div className="flex flex-1 max-w-md">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            placeholder="Buscar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] py-2 pl-10 pr-4 text-sm text-[#0F172A] outline-none transition-colors placeholder:text-slate-400 focus:border-[#0EA5E9] focus:ring-1 focus:ring-[#0EA5E9]/30 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Selector de periodo */}
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-xs font-medium text-[#0F172A] outline-none transition-colors focus:border-[#0EA5E9] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        >
          {PERIOD_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id}>{opt.label}</option>
          ))}
        </select>

        {/* Toggle dark mode */}
        <button
          type="button"
          onClick={toggleTheme}
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-[#E0F2FE] dark:text-slate-400 dark:hover:bg-slate-700"
        >
          {theme === "light" ? (
            <>
              <Moon className="h-4 w-4" />
              <span className="hidden sm:inline">Oscuro</span>
            </>
          ) : (
            <>
              <Sun className="h-4 w-4" />
              <span className="hidden sm:inline">Claro</span>
            </>
          )}
        </button>

        {/* Notificaciones */}
        <button
          type="button"
          className="relative rounded-lg p-2 text-slate-500 transition-colors hover:bg-[#E0F2FE] hover:text-[#0EA5E9] dark:hover:bg-slate-700"
          aria-label="Notificaciones"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#0EA5E9] text-[10px] font-bold text-white">
            0
          </span>
        </button>

        {/* Avatar + menú usuario */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-2 rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2 transition-colors hover:bg-[#E0F2FE] dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0EA5E9] text-white">
              <User className="h-4 w-4" />
            </div>
            <div className="hidden text-left sm:block">
              <p className="text-sm font-medium text-[#0F172A] dark:text-slate-200">Usuario</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Admin</p>
            </div>
            <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${userMenuOpen ? "rotate-180" : ""}`} />
          </button>

          <div
            className={`absolute right-0 top-full mt-1 w-48 rounded-lg border border-[#E5E7EB] bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800 ${
              userMenuOpen ? "block" : "hidden"
            }`}
          >
            <div className="border-b border-[#E5E7EB] px-4 py-2 dark:border-slate-700">
              <p className="text-sm font-medium text-[#0F172A] dark:text-slate-200">Usuario</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">usuario@neura.com</p>
            </div>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-4 py-2 text-sm text-slate-600 transition-colors hover:bg-[#E0F2FE] hover:text-[#0EA5E9] dark:text-slate-400 dark:hover:bg-slate-700"
            >
              <LogOut className="h-4 w-4" />
              Cerrar sesión
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
