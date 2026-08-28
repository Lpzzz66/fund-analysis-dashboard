import { useCallback, useEffect, useState } from "react";
import { Alert, Card, Table } from "antd";
import * as fundsApi from "@/api/funds";
import * as downloads from "@/api/downloads";
import { isApiError } from "@/api/client";
import type { NavPoint } from "@/api/types";
import { Num, useToast } from "@/components";
import { dateStr, pct, dec, returnColor } from "@/utils/format";

export default function NavSeries({ fundId }: { fundId: number }) {
  const [points, setPoints] = useState<NavPoint[]>([]);
  const [totalReturn, setTotalReturn] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fundsApi.navSeries(fundId);
      setPoints(r.data.points);
      setTotalReturn(r.data.total_return);
    } catch (caught) {
      const detail = isApiError(caught) ? caught.detail : "请刷新重试";
      console.error("nav-series load failed", { fundId, status: isApiError(caught) ? caught.status : undefined, detail });
      setError(`净值序列加载失败（${isApiError(caught) ? caught.status : "unknown"}）：${detail}`);
    } finally {
      setLoading(false);
    }
  }, [fundId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <Alert type="error" showIcon message={error} />;

  async function exportSeries() {
    try {
      await downloads.downloadBlob(`/exports/funds/${fundId}/nav-series`, `fund-${fundId}-nav-series.csv`);
      toast.success("净值序列已导出");
    } catch {
      toast.error("导出失败，请稍后重试");
    }
  }

  return (
    <Card
      title="净值序列"
      loading={loading}
      extra={
        <span>
          区间累计收益：
          <Num style={{ color: returnColor(totalReturn) }}>{pct(totalReturn)}</Num>
          {" "}
          <button type="button" className="fd-source-link" onClick={() => void exportSeries()}>
            导出
          </button>
        </span>
      }
    >
      <Table
        rowKey="valuation_date"
        size="small"
        dataSource={points}
        pagination={{ pageSize: 20, showSizeChanger: false }}
        columns={[
          { title: "估值日", dataIndex: "valuation_date", render: dateStr },
          { title: "单位净值", dataIndex: "unit_nav", align: "right", render: (v: string | null) => <Num>{dec(v, 4)}</Num> },
          { title: "累计单位净值", dataIndex: "cumulative_unit_nav", align: "right", render: (v: string | null) => <Num>{dec(v, 4)}</Num> },
          { title: "日收益", dataIndex: "daily_return", align: "right", render: (v: string | null) => <Num style={{ color: returnColor(v) }}>{pct(v)}</Num> },
          { title: "累计收益", dataIndex: "cumulative_return", align: "right", render: (v: string | null) => <Num style={{ color: returnColor(v) }}>{pct(v)}</Num> },
        ]}
      />
    </Card>
  );
}
