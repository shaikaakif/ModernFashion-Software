import { demoService } from './demoService';

export const purchaseService = {
  create: (input) => demoService.createPurchase(input),
};
