import { isUuid } from "../lib/ids";
import { useRoute } from "../router";
import { StoreProduct } from "./StoreProduct";
import { TrackedProduct } from "./TrackedProduct";

/**
 * Product route dispatcher. Numeric store IDs open the pre-tracking details
 * page; UUIDs open the tracked-product workspace.
 */
export default function Product() {
  const [, , productId, trackedId] = useRoute();
  const id = trackedId ?? productId;
  if (!id) {
    return <TrackedProduct targetId="" />;
  }
  if (isUuid(id)) {
    return <TrackedProduct targetId={id} />;
  }
  return <StoreProduct storeId={id} />;
}
