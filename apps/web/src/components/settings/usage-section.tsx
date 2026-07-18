import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { apiGet } from "@/lib/api";
import { format, formatFileSize } from "@/lib/format";
import { cn } from "@/lib/utils";

interface UsageData {
  days: number;
  jobsPerDay: Array<{ day: string; total: number; completed: number; failed: number }>;
  topTools: Array<{ toolId: string; runs: number }>;
  perUser: Array<{ username: string | null; runs: number; bytesIn: string }>;
  durations: Array<{ pool: string; p50Ms: number | null; p95Ms: number | null }>;
  storage: { libraryBytes: string; libraryFiles: number };
  teamStorage?: Array<{ teamName: string; totalBytes: string; userCount: number }>;
}

export function UsageSection() {
  const { t } = useTranslation();
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiGet<UsageData>(`/v1/admin/usage?days=${days}`);
      setData(result);
    } catch {
      setError("Failed to load usage data.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">{t.settings.usage.heading}</h3>
          <p className="text-sm text-muted-foreground mt-1">{t.settings.usage.description}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{t.settings.usage.periodLabel}</span>
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={cn(
                "px-3 py-1 rounded-lg text-xs font-medium transition-colors",
                days === d
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80",
              )}
            >
              {d === 7
                ? t.settings.usage.days7
                : d === 30
                  ? t.settings.usage.days30
                  : t.settings.usage.days90}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <p className="text-sm text-destructive text-center py-8">{error}</p>
      ) : data ? (
        <div className="space-y-6">
          {/* Jobs per day */}
          <div className="rounded-lg border border-border p-4 space-y-3">
            <h4 className="text-sm font-semibold text-foreground">
              {t.settings.usage.jobsPerDayHeading}
            </h4>
            {data.jobsPerDay.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.settings.usage.noData}</p>
            ) : (
              <div className="space-y-1.5">
                {(() => {
                  const maxJobsTotal = Math.max(...data.jobsPerDay.map((r) => r.total), 1);
                  return data.jobsPerDay.map((row) => {
                    const pct = (row.total / maxJobsTotal) * 100;
                    return (
                      <div key={row.day} className="flex items-center gap-3 text-xs">
                        <span className="w-20 shrink-0 text-muted-foreground font-mono">
                          {row.day}
                        </span>
                        <div className="flex-1 h-5 bg-muted/30 rounded overflow-hidden relative">
                          <div
                            className="absolute inset-y-0 start-0 bg-primary/70 rounded"
                            style={{ width: `${pct}%` }}
                          />
                          <span className="absolute inset-y-0 start-0 flex items-center ps-2 text-foreground font-medium z-10">
                            {row.total}
                          </span>
                        </div>
                        <span className="w-14 shrink-0 text-end text-success-ink">
                          {row.completed}
                        </span>
                        <span className="w-10 shrink-0 text-end text-destructive">
                          {row.failed}
                        </span>
                      </div>
                    );
                  });
                })()}
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground pt-1">
                  <span className="w-20 shrink-0" />
                  <span className="flex-1" />
                  <span className="w-14 shrink-0 text-end">{t.settings.usage.completedColumn}</span>
                  <span className="w-10 shrink-0 text-end">{t.settings.usage.failedColumn}</span>
                </div>
              </div>
            )}
          </div>

          {/* Top tools */}
          <div className="rounded-lg border border-border p-4 space-y-3">
            <h4 className="text-sm font-semibold text-foreground">
              {t.settings.usage.topToolsHeading}
            </h4>
            {data.topTools.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.settings.usage.noData}</p>
            ) : (
              <div className="space-y-1.5">
                {(() => {
                  const maxToolRuns = Math.max(...data.topTools.map((r) => r.runs), 1);
                  return data.topTools.map((row) => {
                    const pct = (row.runs / maxToolRuns) * 100;
                    return (
                      <div key={row.toolId} className="flex items-center gap-3 text-xs">
                        <span className="w-32 shrink-0 text-foreground font-medium truncate">
                          {row.toolId}
                        </span>
                        <div className="flex-1 h-5 bg-muted/30 rounded overflow-hidden relative">
                          <div
                            className="absolute inset-y-0 start-0 bg-primary/50 rounded"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="w-12 shrink-0 text-end text-muted-foreground font-mono">
                          {row.runs}
                        </span>
                      </div>
                    );
                  });
                })()}
              </div>
            )}
          </div>

          {/* Per-user volume */}
          <div className="rounded-lg border border-border p-4 space-y-3">
            <h4 className="text-sm font-semibold text-foreground">
              {t.settings.usage.perUserHeading}
            </h4>
            {data.perUser.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.settings.usage.noData}</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-start py-1.5 text-xs font-medium text-muted-foreground">
                      {t.settings.usage.userColumn}
                    </th>
                    <th className="text-end py-1.5 text-xs font-medium text-muted-foreground">
                      {t.settings.usage.runsColumn}
                    </th>
                    <th className="text-end py-1.5 text-xs font-medium text-muted-foreground">
                      {t.settings.usage.bytesInColumn}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.perUser.map((row, i) => (
                    <tr
                      key={row.username ?? `anon-${i}`}
                      className="border-b border-border last:border-0"
                    >
                      <td className="py-1.5 text-foreground">
                        {row.username ?? t.settings.usage.unknownUser}
                      </td>
                      <td className="py-1.5 text-end text-muted-foreground font-mono">
                        {row.runs}
                      </td>
                      <td className="py-1.5 text-end text-muted-foreground font-mono">
                        {formatFileSize(Number(row.bytesIn))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Durations + Storage */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Duration percentiles */}
            <div className="rounded-lg border border-border p-4 space-y-3">
              <h4 className="text-sm font-semibold text-foreground">
                {t.settings.usage.durationsHeading}
              </h4>
              {data.durations.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t.settings.usage.noData}</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-start py-1.5 text-xs font-medium text-muted-foreground">
                        {t.settings.usage.poolColumn}
                      </th>
                      <th className="text-end py-1.5 text-xs font-medium text-muted-foreground">
                        {t.settings.usage.p50Column}
                      </th>
                      <th className="text-end py-1.5 text-xs font-medium text-muted-foreground">
                        {t.settings.usage.p95Column}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.durations.map((row) => (
                      <tr key={row.pool} className="border-b border-border last:border-0">
                        <td className="py-1.5 text-foreground">{row.pool}</td>
                        <td className="py-1.5 text-end text-muted-foreground font-mono">
                          {row.p50Ms != null ? `${row.p50Ms}ms` : "-"}
                        </td>
                        <td className="py-1.5 text-end text-muted-foreground font-mono">
                          {row.p95Ms != null ? `${row.p95Ms}ms` : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Storage */}
            <div className="rounded-lg border border-border p-4 space-y-3">
              <h4 className="text-sm font-semibold text-foreground">
                {t.settings.usage.storageHeading}
              </h4>
              <div className="space-y-2">
                <p className="text-2xl font-bold text-foreground">
                  {formatFileSize(Number(data.storage.libraryBytes))}
                </p>
                <p className="text-sm text-muted-foreground">
                  {format(t.settings.usage.storageFiles, { count: data.storage.libraryFiles })}
                </p>
              </div>
            </div>
          </div>

          {/* Storage by Team */}
          {data.teamStorage && data.teamStorage.length > 0 && (
            <div className="rounded-lg border border-border p-4 space-y-3">
              <h4 className="text-sm font-semibold text-foreground">
                {t.settings.usage.storageByTeam}
              </h4>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-start py-1.5 text-xs font-medium text-muted-foreground">
                      {t.settings.usage.teamColumn}
                    </th>
                    <th className="text-end py-1.5 text-xs font-medium text-muted-foreground">
                      {t.settings.usage.storageColumn}
                    </th>
                    <th className="text-end py-1.5 text-xs font-medium text-muted-foreground">
                      {t.settings.usage.usersColumn}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.teamStorage.map((row) => (
                    <tr key={row.teamName} className="border-b border-border last:border-0">
                      <td className="py-1.5 text-foreground">{row.teamName}</td>
                      <td className="py-1.5 text-end text-muted-foreground font-mono">
                        {formatFileSize(Number(row.totalBytes))}
                      </td>
                      <td className="py-1.5 text-end text-muted-foreground font-mono">
                        {row.userCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
