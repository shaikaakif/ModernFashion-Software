import { demoService } from './demoService';

export const customerService = {
  create: (input) => demoService.createCustomer(input),
  update: (customerId, input) => demoService.updateCustomer(customerId, input),
};
