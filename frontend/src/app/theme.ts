import type { ThemeConfig } from "antd";

/**
 * Design tokens for the fund valuation dashboard.
 * Deliberately departs from default Ant Design look: deep ink navy chrome,
 * cool paper canvas, signal-blue accent, and a monospace numeric typeface
 * that makes figures the visual identity of the terminal.
 */
const ink = "#0F1B2D";
const paper = "#F6F8FB";
const rule = "#E3E8F0";
const accent = "#1F6FEB";
const amber = "#C2740B";
const crimson = "#D43F3F";
const sage = "#2F855A";

export const theme: ThemeConfig = {
  token: {
    colorPrimary: accent,
    colorInfo: accent,
    colorSuccess: sage,
    colorWarning: amber,
    colorError: crimson,
    colorTextBase: ink,
    colorBgBase: paper,
    borderRadius: 6,
    fontFamily:
      'Inter, system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif',
    fontSize: 14,
    colorBgLayout: paper,
    colorBorder: rule,
    colorBorderSecondary: rule,
    colorBgContainer: "#FFFFFF",
    wireframe: false,
  },
  components: {
    Layout: {
      headerBg: ink,
      siderBg: ink,
      bodyBg: paper,
      triggerBg: "#16273D",
      triggerColor: "#C9D6E8",
    },
    Menu: {
      darkItemBg: "transparent",
      darkSubMenuItemBg: "transparent",
      darkItemSelectedBg: "rgba(31,111,235,0.22)",
      darkItemHoverBg: "rgba(255,255,255,0.06)",
      darkItemColor: "#9FB2CD",
      darkItemSelectedColor: "#FFFFFF",
      itemHeight: 38,
      itemMarginInline: 0,
    },
    Table: {
      headerBg: "#EEF2F8",
      headerColor: "#3B4F70",
      rowHoverBg: "#F0F5FB",
      borderColor: rule,
      cellPaddingInline: 12,
      cellPaddingBlock: 9,
    },
    Card: {
      borderRadiusLG: 8,
      paddingLG: 18,
      colorBorderSecondary: rule,
    },
    Button: {
      primaryShadow: "none",
      defaultBorderColor: rule,
      controlHeight: 32,
    },
    Tag: {
      defaultBg: "transparent",
    },
    Modal: {
      borderRadiusLG: 8,
    },
    Drawer: {
      borderRadiusLG: 0,
    },
  },
};

export const palette = { ink, paper, rule, accent, amber, crimson, sage };
