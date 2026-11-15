import { demoService } from './demoService';

export const productService = {
  create: (input) => demoService.createProduct(input),
  update: (productId, input) => demoService.updateProduct(productId, input),
  remove: (productId) => demoService.deleteProduct(productId),
};
