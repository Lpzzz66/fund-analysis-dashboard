import { useEffect, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { Tabs, Descriptions, Button, Space, Card, Tag, Skeleton } from "antd";
import * as api from "@/mock/api";
import type * as db from "@/mock/db";
import { Num, QualityBadge, useToast } from "@/components";
import { dec, pct, dateStr } from "@/utils/format";
import type { QualityStatus } from "@/utils/constants";
import { OverviewTab } from "./tabs/Overview";
import { NavDrawdownTab } from "./tabs/NavDrawdown";
import { AllocationTab } from "./tabs/Allocation";
import { PositionsTab } from "./tabs/Positions";
import { ShareClassesTab } from "./tabs/ShareClasses";
import { QualityTab } from "./tabs/Quality";

export default function FundDetail() {
  const { id } = useParams();
  const fundId = Number(id);
  const [sp, setSp] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [fund, setFund] = useState<db.FundRow | null>(null);
  const [ov, setOv] = useState<Awaited<ReturnType<typeof api.fundOverview>>["data"] | null>(null);
  const [tab, setTab] = useState(sp.get("tab") || "overview");

  async function load() {
    const f = await api.fundDetail(fundId);
    setFund(f.data);
    const o = await api.fundOverview(fundId);
    setOv(o.data);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fundId]);

  if (!fund || !ov) return <Skeleton active style={{ padding: 40 }} />;

  return (
    <div className="fd-page">
      <Card style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <h1 style={{ margin: 0, fontSize: 22 }}>{fund.name}</h1>
              <Tag>{fund.strategy}</Tag>
              <Tag color={fund.status === "active" ? "success" : "default"}>{fund.status === "active" ? "启用" : "停用"}</Tag>
            </div>
            <Space size="large" wrap>
              <span className="fd-caption">数据截至 <Num>{dateStr(ov.valuation_date)}</Num></span>
              <span className="fd-caption">版本 <Num>v{String(fund.current_version_id ?? "—")}</Num></span>
              <span className="fd-caption">质量 <QualityBadge status={ov.quality_status as QualityStatus} /></span>
            </Space>
          </div>
          <Space wrap>
            <Button onClick={() => { toast.info("导出当前页数据和口径说明（演示）"); }}>导出概览</Button>
            <Button onClick={() => navigate("/imports?fund=" + fundId)}>查看原表</Button>
            <Button onClick={() => toast.info("查看版本历史（演示）")}>查看版本</Button>
          </Space>
        </div>
        <Descriptions size="small" column={6} style={{ marginTop: 16 }}>
          <Descriptions.Item label="净资产"><Num>{dec(ov.net_assets, 2)}</Num></Descriptions.Item>
          <Descriptions.Item label="单位净值"><Num>{dec(ov.unit_nav, 4)}</Num></Descriptions.Item>
          <Descriptions.Item label="日收益率"><Num style={{ color: Number(ov.daily_return) >= 0 ? "var(--sage)" : "var(--crimson)" }}>{pct(ov.daily_return)}</Num></Descriptions.Item>
          <Descriptions.Item label="累计单位净值"><Num>{dec(ov.cumulative_unit_nav, 4)}</Num></Descriptions.Item>
          <Descriptions.Item label="数据质量"><QualityBadge status={ov.quality_status as QualityStatus} /></Descriptions.Item>
          <Descriptions.Item label="估值日"><Num>{dateStr(ov.valuation_date)}</Num></Descriptions.Item>
        </Descriptions>
      </Card>

      <Tabs
        activeKey={tab}
        onChange={(k) => { setTab(k); setSp({ tab: k }); }}
        items={[
          { key: "overview", label: "概览", children: <OverviewTab fundId={fundId} ov={ov as NonNullable<typeof ov>} /> },
          { key: "nav", label: "净值和回撤", children: <NavDrawdownTab fundId={fundId} /> },
          { key: "allocation", label: "资产配置", children: <AllocationTab fundId={fundId} /> },
          { key: "positions", label: "持仓", children: <PositionsTab fundId={fundId} /> },
          { key: "shareclasses", label: "份额类别", children: <ShareClassesTab fundId={fundId} /> },
          { key: "quality", label: "数据质量", children: <QualityTab fundId={fundId} /> },
        ]}
      />
    </div>
  );
}
