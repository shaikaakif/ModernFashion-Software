import { configureStore } from '@reduxjs/toolkit';

import demoReducer, { DEMO_STORAGE_KEY } from './demo/demoSlice';

const store = configureStore({
  reducer: { demo: demoReducer },
  devTools: import.meta.env.DEV,
});

if (typeof window !== 'undefined') {
  const persistDemo = () => {
    try {
      window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(store.getState().demo));
    } catch (error) {
      console.warn('Could not save demo data to localStorage.', error);
    }
  };
  store.subscribe(persistDemo);
  persistDemo();
}

export default store;
