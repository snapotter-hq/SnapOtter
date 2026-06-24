import DefaultTheme from "vitepress/theme";
import DocsHome from "./DocsHome.vue";
import Layout from "./Layout.vue";
import "./vars.css";
import "./fonts.css";
import "./github-stars.css";
import "./search.css";

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }) {
    app.component("DocsHome", DocsHome);
  },
};
