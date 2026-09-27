import { describe, expect, it } from "vitest";
import { buildProductCsv } from "./exportCsv";

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
        "2626,\"Redwick, \"\"Nano\"\"\",o1,2026-09-26T16:00:01Z,50396,0,success,1\n" +
        "2626,\"Redwick, \"\"Nano\"\"\",o1,2026-09-26T18:00:01Z,,,failed,2\n",
    );
  });
});
