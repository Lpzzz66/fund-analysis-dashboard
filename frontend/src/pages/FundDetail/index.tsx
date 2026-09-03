import { useEffect, useState } from "react";
import { Alert, Card, Col, Descriptions, Row, Skeleton, Space, Tabs, Tag } from "antd";
import { Navigate, useParams, useSearchParams } from "react-router-dom";
import * as fundsApi from "@/api/funds";
import type { FundDetail as FundDetailData } from "@/api/types";
import { QualityBadge } from "@/components";
import { compactMoney, dateStr, dec, pct, returnColor } from "@/utils/format";
import NavSeriesTab from "./tabs/NavSeries";
import { PositionsTab } from "./tabs/Positions";
import { QualityTab } from "./tabs/Quality";

export default function FundDetail() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const [fund, setFund] = useState<FundDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rawId = Number(id);
  const fundId = Number.isInteger(rawId) && rawId > 0 ? rawId : NaN;

  useEffect(() => {
    if (!Number.isInteger(fundId)) return;
    void fundsApi.detail(fundId)
      .then((r) => setFund(r.data))
      .catch(() => setError("产品详情加载失败，请返回产品列表重试"));
  }, [fundId]);

  if (!Number.isInteger(fundId)) return <Navigate to="/funds" replace />;
  if (error) return <div className="fd-page"><Alert type="error" showIcon message={error} /></div>;
  if (!fund) return <Skeleton active style={{ padding: 40 }} />;

  const activeTab = ["nav", "quality"].includes(params.get("tab") ?? "") ? params.get("tab")! : "nav";
  return (
    <div className="fd-page">
      <Card className="fd-detail-summary" style={{ marginBottom: 12 }}>
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <Space>
            <h1 className="fd-detail-title">{fund.name}</h1>
            <Tag color={fund.status === "active" ? "success" : "default"}>{fund.status === "active" ? "启用" : "停用"}</Tag>
          </Space>
          <Row gutter={[10, 10]} className="fd-detail-metrics">
            <Col xs={12} sm={6}><div className="fd-kpi fd-detail-metric"><div className="fd-kpi__label">资产规模</div><div className="fd-kpi__value">{compactMoney(fund.total_assets)}</div></div></Col>
            <Col xs={12} sm={6}><div className="fd-kpi fd-detail-metric"><div className="fd-kpi__label">资产净值</div><div className="fd-kpi__value">{compactMoney(fund.net_asset_value)}</div></div></Col>
            <Col xs={12} sm={6}><div className="fd-kpi fd-detail-metric"><div className="fd-kpi__label">单位净值</div><div className="fd-kpi__value">{dec(fund.unit_nav, 4)}</div></div></Col>
            <Col xs={12} sm={6}><div className="fd-kpi fd-detail-metric"><div className="fd-kpi__label">日收益 / 累计</div><div className="fd-kpi__value fd-detail-return"><span style={{ color: returnColor(fund.daily_return) }}>{pct(fund.daily_return)}</span><span style={{ color: returnColor(fund.cumulative_return) }}>{pct(fund.cumulative_return)}</span></div></div></Col>
          </Row>
          <Descriptions className="fd-detail-meta" size="small" column={{ xs: 1, sm: 3 }}>
            <Descriptions.Item label="产品代码">{fund.product_code ?? "—"}</Descriptions.Item>
            <Descriptions.Item label="估值日">{dateStr(fund.valuation_date)}</Descriptions.Item>
            <Descriptions.Item label="质量"><QualityBadge status={fund.quality_status} /></Descriptions.Item>
            <Descriptions.Item label="分析状态">{fund.analysis_status}</Descriptions.Item>
          </Descriptions>
        </Space>
      </Card>

      <PositionsTab fundId={fundId} />

      <Tabs
        activeKey={activeTab}
        onChange={(key) => setParams((previous) => { const next = new URLSearchParams(previous); next.set("tab", key); return next; })}
        items={[
          { key: "nav", label: "历史净值走势", children: <NavSeriesTab fundId={fundId} /> },
          { key: "quality", label: "数据质量", children: <QualityTab fundId={fundId} /> },
        ]}
      />
    </div>
  );
}
