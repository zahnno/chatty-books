import "./apiBootstrap.js";
import React from "react";
import ReactDOM from "react-dom";
import App from "./App";
import { HashRouter } from "react-router-dom";
import ScrollToTop from "./components/ScrollToTop";

// The app uses hash routes, but store listings link plain paths such as
// /privacy and /terms (the static host serves index.html for them). Send
// those to the matching hash route instead of showing the home page.
const { pathname, search, hash } = window.location;
if (pathname !== "/" && pathname !== "/index.html" && !hash) {
  window.location.replace("/#" + pathname + search);
}

ReactDOM.render(
  <React.StrictMode>
    <HashRouter>
      <ScrollToTop />
      <App />
    </HashRouter>
  </React.StrictMode>,
  document.getElementById("root")
);
