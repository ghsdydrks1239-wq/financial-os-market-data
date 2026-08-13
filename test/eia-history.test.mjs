import test from "node:test";
import assert from "node:assert/strict";
import { parseEiaHistoryHtml } from "../src/lib/eia-history.mjs";

test("parses EIA weekly rows into dated daily observations", () => {
  const html = `
    <html><head><title>Cushing, OK WTI Spot Price FOB (Dollars per Barrel)</title></head><body>
      <table>
        <tr>
          <td class='B6'>&nbsp;&nbsp;2026 Jun-29 to Jul- 3</td>
          <td class='B3'>71.87</td><td class='B3'>70.56</td><td class='B3'>69.74</td>
          <td class='B3'>69.73</td><td class='B3'></td>
        </tr>
        <tr>
          <td class='B6'>&nbsp;&nbsp;2026 Jul- 6 to Jul-10</td>
          <td class='B3'>69.60</td><td class='B3'>71.53</td><td class='B3'>74.56</td>
          <td class='B3'>73.15</td><td class='B3'>72.45</td>
        </tr>
      </table>
      <div>Release Date: 7/8/2026</div>
    </body></html>`;

  const result = parseEiaHistoryHtml(html);
  assert.equal(result.title, "Cushing, OK WTI Spot Price FOB (Dollars per Barrel)");
  assert.equal(result.releaseDate, "2026-07-08");
  assert.equal(result.observations.length, 9);
  assert.deepEqual(result.observations[0], { sourceDate: "2026-06-29", value: 71.87 });
  assert.deepEqual(result.observations.at(-1), { sourceDate: "2026-07-10", value: 72.45 });
});

test("ignores EIA missing-value markers", () => {
  const html = `<tr><td class="B6">2026 Aug-10 to Aug-14</td><td class="B3">2.72</td><td class="B3">NA</td><td class="B3">-</td><td class="B3">W</td><td class="B3">2.79</td></tr>`;
  assert.deepEqual(parseEiaHistoryHtml(html).observations, [
    { sourceDate: "2026-08-10", value: 2.72 },
    { sourceDate: "2026-08-14", value: 2.79 },
  ]);
});
