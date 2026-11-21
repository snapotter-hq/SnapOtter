import { inBrowser } from "vitepress";
import DefaultTheme from "vitepress/theme";
import DocsHome from "./DocsHome.vue";
import { installHeadingLinks } from "./heading-links.js";
import Layout from "./Layout.vue";
import "./vars.css";
import "./fonts.css";
import "./github-stars.css";
import "./search.css";
import "./doc-affordances.css";

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }) {
    app.component("DocsHome", DocsHome);
    if (inBrowser) installHeadingLinks(document);
  },
};
