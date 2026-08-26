import { useEffect, useState } from "react";
import { Alert, Card, Descriptions, Skeleton, Space, Tabs, Tag } from "antd";
import { useParams, useSearchParams } from "react-router-dom";
import * as fundsApi from "@/api/funds";
import type { FundDetail as FundDetailData } from "@/api/types";
import { QualityBadge } from "@/components";
import { dateStr } from "@/utils/format";
import NavSeriesTab from "./tabs/NavSeries";
import { PositionsTab } from "./tabs/Positions";
import { QualityTab } from "./tabs/Quality";

export default function FundDetail() {
  const { id } = useParams(); const fundId = Number(id); const [params, setParams] = useSearchParams(); const [fund, setFund] = useState<FundDetailData | null>(null); const [error, setError] = useState<string | null>(null);
  useEffect(() => { void fundsApi.detail(fundId).then((r) => setFund(r.data)).catch(() => setError("产品详情加载失败，请返回产品列表重试")); }, [fundId]);
  if (error) return <div className="fd-page"><Alert type="error" showIcon message={error} /></div>;
  if (!fund) return <Skeleton active style={{ padding: 40 }} />;
  const activeTab = ["nav", "positions", "quality"].includes(params.get("tab") ?? "") ? params.get("tab")! : "nav";
  return <div className="fd-page"><Card style={{ marginBottom: 12 }}><Space direction="vertical" size={8}><Space><h1 style={{ margin: 0, fontSize: 22 }}>{fund.name}</h1><Tag color={fund.status === "active" ? "success" : "default"}>{fund.status === "active" ? "启用" : "停用"}</Tag></Space><Descriptions size="small" column={{ xs: 1, sm: 3 }}><Descriptions.Item label="产品代码">{fund.product_code ?? "—"}</Descriptions.Item><Descriptions.Item label="估值日">{dateStr(fund.valuation_date)}</Descriptions.Item><Descriptions.Item label="质量"><QualityBadge status={fund.quality_status} /></Descriptions.Item><Descriptions.Item label="分析状态">{fund.analysis_status}</Descriptions.Item></Descriptions></Space></Card><Tabs activeKey={activeTab} onChange={(key) => setParams({ tab: key })} items={[{ key: "nav", label: "净值序列", children: <NavSeriesTab fundId={fundId} /> }, { key: "positions", label: "持仓", children: <PositionsTab fundId={fundId} /> }, { key: "quality", label: "数据质量", children: <QualityTab fundId={fundId} /> }]} /></div>;
}
