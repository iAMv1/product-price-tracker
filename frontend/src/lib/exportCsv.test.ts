import { describe, expect, it } from "vitest";
import { buildProductCsv, toIsoUtc } from "./exportCsv";

describe("buildProductCsv", () => {
  it("matches the server column order and leaves failed rows empty", () => {
    const csv = buildProductCsv(
      {
        storeProductId: "2626",
        productName: 'Redwick, "Nano"',
        selectedOption: "o1",
      },
      [
        {
          attempt_number: 2,
          attempted_at: "2026-09-26T18:00:01Z",
          outcome: "failed",
          price: null,
          stock: null,
          http_status: 500,
          error_code: "=BAD",
          error_message: null,
        },
        {
          attempt_number: 1,
          attempted_at: "2026-09-26T16:00:01Z",
          outcome: "success",
          price: 50396,
          stock: "0",
          http_status: 200,
          error_code: null,
          error_message: null,
        },
      ],
    );
    expect(csv).toBe(
      "product_id,product_name,selected_option,timestamp,price,stock,outcome,attempt_number\n" +
        "2626,\"Redwick, \"\"Nano\"\"\",o1,2026-09-26T16:00:01.000Z,50396,0,success,1\n" +
        "2626,\"Redwick, \"\"Nano\"\"\",o1,2026-09-26T18:00:01.000Z,,,failed,2\n",
    );
  });

  it("normalizes timestamps to ISO 8601 UTC", () => {
    expect(toIsoUtc("2026-09-27T06:50:01+02:00")).toBe("2026-09-27T04:50:01.000Z");
    expect(toIsoUtc("2026-09-27T04:50:01.776Z")).toBe("2026-09-27T04:50:01.776Z");
    expect(toIsoUtc("not-a-date")).toBe("not-a-date");
  });
});
