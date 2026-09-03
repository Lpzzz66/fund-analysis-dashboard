import { theme as antdTheme, type ThemeConfig } from "antd";

/**
 * Design tokens for the fund valuation dashboard.
 * Warm operations-terminal palette shared with the private-fund operations
 * board: charcoal surfaces, parchment text, bronze actions and restrained
 * semantic colors.
 */
const page = "#131312";
const panel = "#1A1A1A";
const panelSoft = "#22201D";
const sidebar = "#0D0D0C";
const text = "#E7DED1";
const textStrong = "#F3ECE2";
const muted = "#9F9587";
const mutedStrong = "#C0B5A7";
const rule = "#34312C";
const ruleStrong = "#4A443B";
const accent = "#9C6B30";
const accentDark = "#B98545";
const amber = "#C39758";
const crimson = "#D16F63";
const sage = "#71A28A";

export const theme: ThemeConfig = {
  algorithm: antdTheme.darkAlgorithm,
  token: {
    colorPrimary: accent,
    colorInfo: accent,
    colorSuccess: sage,
    colorWarning: amber,
    colorError: crimson,
    colorTextBase: text,
    colorText: text,
    colorTextSecondary: muted,
    colorBgBase: page,
    borderRadius: 8,
    fontFamily:
      'Inter, system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif',
    fontSize: 14,
    colorBgLayout: page,
    colorBorder: rule,
    colorBorderSecondary: rule,
    colorBgContainer: panel,
    colorFillAlter: panelSoft,
    colorFillSecondary: "#26231F",
    colorBgElevated: "#25221E",
    wireframe: false,
  },
  components: {
    Layout: {
      headerBg: panel,
      siderBg: sidebar,
      bodyBg: page,
      triggerBg: "#191714",
      triggerColor: mutedStrong,
    },
    Menu: {
      darkItemBg: "transparent",
      darkSubMenuItemBg: "transparent",
      darkItemSelectedBg: "rgba(156,107,48,0.24)",
      darkItemHoverBg: "rgba(255,255,255,0.06)",
      darkItemColor: "#A99E90",
      darkItemSelectedColor: textStrong,
      itemHeight: 38,
      itemMarginInline: 0,
      itemBorderRadius: 8,
    },
    Table: {
      headerBg: panelSoft,
      headerColor: mutedStrong,
      rowHoverBg: "#2A2723",
      borderColor: rule,
      cellPaddingInline: 12,
      cellPaddingBlock: 9,
    },
    Card: {
      borderRadiusLG: 8,
      paddingLG: 18,
      colorBorderSecondary: rule,
      colorBgContainer: panel,
    },
    Button: {
      primaryShadow: "none",
      defaultColor: mutedStrong,
      defaultBg: panelSoft,
      defaultHoverBg: "#302B25",
      defaultHoverColor: textStrong,
      defaultHoverBorderColor: accentDark,
      controlHeight: 32,
    },
    Tag: {
      defaultBg: "transparent",
      defaultColor: mutedStrong,
    },
    Modal: {
      borderRadiusLG: 8,
      contentBg: panel,
      headerBg: panel,
    },
    Drawer: {
      borderRadiusLG: 0,
      colorBgElevated: panel,
    },
    Input: { colorBgContainer: panelSoft, colorBorder: ruleStrong, activeBorderColor: accentDark, hoverBorderColor: accentDark },
    Select: { colorBgContainer: panelSoft, colorBorder: ruleStrong, optionSelectedBg: "#3B2A19" },
    Tabs: { itemColor: muted, itemSelectedColor: accentDark, itemHoverColor: textStrong, inkBarColor: accentDark },
  },
};

export const palette = { page, panel, panelSoft, sidebar, text, textStrong, muted, mutedStrong, rule, ruleStrong, accent, accentDark, amber, crimson, sage };
