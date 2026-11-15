import { demoService } from './demoService';

export const invoiceService = {
  create: (input) => demoService.createInvoice(input),
};
