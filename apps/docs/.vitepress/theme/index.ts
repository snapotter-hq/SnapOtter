import DefaultTheme from "vitepress/theme";
import Layout from "./Layout.vue";
import "./vars.css";
import "./fonts.css";
import "./github-stars.css";

export default {
  extends: DefaultTheme,
  Layout,
};
