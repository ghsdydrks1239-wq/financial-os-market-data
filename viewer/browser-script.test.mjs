import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";

const modelSource = await fs.readFile(new URL("./model.js", import.meta.url), "utf8");
const dashboardSource = await fs.readFile(new URL("./dashboard.js", import.meta.url), "utf8");
const snapshot = JSON.parse(await fs.readFile(new URL("../data/public/latest.json", import.meta.url), "utf8"));

function createDocument() {
  const nodes = new Map();
  const node = (selector) => {
    if (!nodes.has(selector)) {
      nodes.set(selector, {
        addEventListener() {},
        className: "",
        focus() {},
        hidden: false,
        innerHTML: "",
        setAttribute() {},
        textContent: "",
        value: "",
      });
    }
    return nodes.get(selector);
  };
  return {
    nodes,
    document: {
      querySelector: node,
      querySelectorAll() {
        return [];
      },
    },
  };
}

test("classic browser scripts load together without global declaration collisions", () => {
  const { document, nodes } = createDocument();
  const context = vm.createContext({ console, Date, Intl, document });
  vm.runInContext("globalThis.window = globalThis;", context);

  vm.runInContext(modelSource, context, { filename: "model.js" });
  vm.runInContext(dashboardSource, context, { filename: "dashboard.js" });

  assert.match(nodes.get("#dashboard").innerHTML, /데이터 파일을 찾지 못했습니다/);
  assert.equal(nodes.get(".toolbar").hidden, true);
});

test("browser scripts render the current snapshot overview", () => {
  const { document, nodes } = createDocument();
  const context = vm.createContext({ console, Date, Intl, document, MARKET_DATA: snapshot, MARKET_LOCAL_META: {} });
  vm.runInContext("globalThis.window = globalThis;", context);

  vm.runInContext(modelSource, context, { filename: "model.js" });
  vm.runInContext(dashboardSource, context, { filename: "dashboard.js" });

  assert.equal(nodes.get("#reference-date").textContent, `${snapshot.referenceDate} · KST`);
  assert.match(nodes.get("#health-label").textContent, /^\d+\/69 정상$/);
  assert.match(nodes.get("#dashboard").innerHTML, /DAILY CONTROL BOARD/);
  assert.match(nodes.get("#dashboard").innerHTML, /U\.S\. Treasury Curve/);
  assert.equal(nodes.get("#result-count").textContent, "12");
});
