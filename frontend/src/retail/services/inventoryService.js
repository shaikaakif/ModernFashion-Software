import { demoService } from './demoService';

export const inventoryService = {
  adjust: (input) => demoService.adjustStock(input),
};
