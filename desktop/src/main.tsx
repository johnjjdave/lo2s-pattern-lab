import React from "react";
import ReactDOM from "react-dom/client";
import Home from "../../app/page";
import "../../app/globals.css";
import "./desktop.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Home />
  </React.StrictMode>,
);

