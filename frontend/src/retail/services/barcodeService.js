import { demoService } from './demoService';

export const barcodeService = {
  assign: (variantId) => demoService.assignBarcode(variantId),
};
