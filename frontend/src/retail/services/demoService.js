import store from '@/redux/store';
import { demoActions } from '@/redux/demo/demoSlice';
import {
  adjustStockOperation,
  assignBarcodeOperation,
  createCustomerOperation,
  createInvoiceOperation,
  createProductOperation,
  createPurchaseOperation,
  deleteProductOperation,
  updateBusinessOperation,
  updateCustomerOperation,
  updateProductOperation,
} from './operations';

function currentDb() {
  return store.getState().demo;
}

function commit(nextDb) {
  store.dispatch(demoActions.replaceAll(nextDb));
}

export const demoService = {
  reset() {
    store.dispatch(demoActions.resetData());
  },
  createInvoice(input) {
    const { db, invoice } = createInvoiceOperation(currentDb(), input);
    commit(db);
    return invoice;
  },
  createPurchase(input) {
    const { db, purchase } = createPurchaseOperation(currentDb(), input);
    commit(db);
    return purchase;
  },
  adjustStock(input) {
    const { db, movement } = adjustStockOperation(currentDb(), input);
    commit(db);
    return movement;
  },
  createProduct(input) {
    const { db, product } = createProductOperation(currentDb(), input);
    commit(db);
    return product;
  },
  updateProduct(productId, input) {
    const { db, product } = updateProductOperation(currentDb(), productId, input);
    commit(db);
    return product;
  },
  deleteProduct(productId) {
    const { db } = deleteProductOperation(currentDb(), productId);
    commit(db);
  },
  createCustomer(input) {
    const { db, customer } = createCustomerOperation(currentDb(), input);
    commit(db);
    return customer;
  },
  updateCustomer(customerId, input) {
    const { db, customer } = updateCustomerOperation(currentDb(), customerId, input);
    commit(db);
    return customer;
  },
  updateBusiness(input) {
    const { db, business } = updateBusinessOperation(currentDb(), input);
    commit(db);
    return business;
  },
  assignBarcode(variantId) {
    const { db, variant, assigned } = assignBarcodeOperation(currentDb(), variantId);
    commit(db);
    return { variant, assigned };
  },
};
