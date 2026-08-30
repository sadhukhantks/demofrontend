"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { apiRoutesconsole } from "@/utils/api"
import { fetchWithCookie } from "@/utils/apiClient2"

type TenantStat = {
  con_org_id: number
  con_org_name: string
  con_org_shortname: string | null
  companies: number | null
  active_users: number | null
}

type DashboardStats = {
  active_tenants: number
  tenants: TenantStat[]
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const { data, error } = await fetchWithCookie(
        apiRoutesconsole.CTRLDSK_DASHBOARD_STATS,
        "GET"
      )
      if (error || !data?.data) {
        setError(error || "Failed to load dashboard stats")
        return
      }
      setStats(data.data)
    }
    load()
  }, [])

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard Consoles</h1>
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
        <Card className="p-6">
          <h3 className="font-semibold mb-2">Active Tenants</h3>
          <p className="text-2xl font-bold">{stats ? stats.active_tenants : "…"}</p>
        </Card>
      </div>

      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {stats.tenants.map((t) => (
            <Card key={t.con_org_id} className="p-6">
              <h3 className="font-semibold mb-1">{t.con_org_name}</h3>
              <p className="text-xs text-gray-500 mb-3">
                {t.con_org_shortname || "no tenant DB"}
              </p>
              <div className="flex gap-8">
                <div>
                  <p className="text-2xl font-bold">{t.companies ?? "—"}</p>
                  <p className="text-sm text-gray-500">Companies</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">{t.active_users ?? "—"}</p>
                  <p className="text-sm text-gray-500">Active Users</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
